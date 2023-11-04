import { useCallback, useEffect, useMemo, useState } from 'react';
import { Program, utils, BN } from '@coral-xyz/anchor';
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Signer,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import { IdlAccounts } from '@coral-xyz/anchor/dist/cjs/program/namespace/types';
import { OracleConfigParams } from '@openbook-dex/openbook-v2';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { AutocratV0, IDL as AUTOCRAT_IDL } from '../lib/idl/autocrat_v0';
import { IDL as OPENBOOK_IDL, OpenbookV2 } from '../lib/idl/openbook_v2';
import { useProvider } from './useProvider';
import { useTokens } from './useTokens';
import { useConditionalVault } from './useConditionalVault';
import { OpenbookTwap, IDL as OPENBOOK_TWAP_IDL } from '../lib/idl/openbook_twap';

export type DaoState = IdlAccounts<AutocratV0>['dao'];

const OPENBOOK_PROGRAM_ID = new PublicKey('opnb2LAfJYbRMAHHvqjCwQxanZn7ReEHp1k81EohpZb');
const OPENBOOK_TWAP_PROGRAM_ID = new PublicKey('2qjEsiMtWxAdqUSdaGM28pJRMtodnnkHZEoadc6JcFCb');
const BooksideSpace = 90944 + 8;
const EventHeapSpace = 91280 + 8;

const createProgramAccount = async (
  program: Program<OpenbookV2>,
  authority: PublicKey,
  size: number,
) => {
  const lamports = await program.provider.connection.getMinimumBalanceForRentExemption(size);
  const address = Keypair.generate();
  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: authority,
      newAccountPubkey: address.publicKey,
      lamports,
      space: size,
      programId: program.programId,
    }),
  );
  return { tx, signers: [address] };
};

const createOpenbookMarket = async (
  program: Program<OpenbookV2>,
  creator: PublicKey,
  baseMint: PublicKey,
  quoteMint: PublicKey,
  name: string,
  quoteLotSize: BN,
  baseLotSize: BN,
  makerFee: BN,
  takerFee: BN,
  timeExpiry: BN,
  oracleA: PublicKey | null,
  oracleB: PublicKey | null,
  openOrdersAdmin: PublicKey | null,
  consumeEventsAdmin: PublicKey | null,
  closeMarketAdmin: PublicKey | null,
  oracleConfigParams: OracleConfigParams = { confFilter: 0.1, maxStalenessSlots: 100 },
  market: Keypair = Keypair.generate(),
  collectFeeAdmin?: PublicKey,
): Promise<{ signers: Signer[]; instructions: (Transaction | TransactionInstruction)[] }> => {
  const bids = await createProgramAccount(program, creator, BooksideSpace);
  const asks = await createProgramAccount(program, creator, BooksideSpace);
  const eventHeap = await createProgramAccount(program, creator, EventHeapSpace);
  const [marketAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from('Market'), market.publicKey.toBuffer()],
    program.programId,
  );
  const baseVault = getAssociatedTokenAddressSync(baseMint, marketAuthority, true);
  const quoteVault = getAssociatedTokenAddressSync(quoteMint, marketAuthority, true);
  const [eventAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from('__event_authority')],
    program.programId,
  );

  return {
    signers: [...bids.signers, ...asks.signers, ...eventHeap.signers],
    instructions: [
      bids.tx,
      asks.tx,
      eventHeap.tx,
      await program.methods
        .createMarket(
          name,
          oracleConfigParams,
          quoteLotSize,
          baseLotSize,
          makerFee,
          takerFee,
          timeExpiry,
        )
        .accounts({
          market: market.publicKey,
          marketAuthority,
          bids: bids.signers[0].publicKey,
          asks: asks.signers[0].publicKey,
          eventHeap: eventHeap.signers[0].publicKey,
          payer: creator,
          marketBaseVault: baseVault,
          marketQuoteVault: quoteVault,
          baseMint,
          quoteMint,
          oracleA,
          oracleB,
          collectFeeAdmin: collectFeeAdmin != null ? collectFeeAdmin : creator,
          openOrdersAdmin,
          consumeEventsAdmin,
          closeMarketAdmin,
          eventAuthority,
          program: program.programId,
        })
        .instruction(),
    ],
  };
};

export function useAutocrat() {
  const provider = useProvider();
  const wallet = useWallet();
  const { connection } = useConnection();
  const programId = new PublicKey('meta3cxKzFBmWYgCVozmvCQAS3y9b3fGxrG9HkHL7Wi');
  const { initializeVault } = useConditionalVault();
  const { tokens } = useTokens();
  const dao = useMemo(
    () =>
      PublicKey.findProgramAddressSync(
        [utils.bytes.utf8.encode('WWCACOTMICMIBMHAFTTWYGHMB')],
        programId,
      )[0],
    [programId],
  );
  const daoTreasury = useMemo(
    () => PublicKey.findProgramAddressSync([dao.toBuffer()], programId)[0],
    [programId],
  );
  const program = useMemo(
    () => new Program<AutocratV0>(AUTOCRAT_IDL, programId, provider),
    [provider, programId],
  );
  const [daoState, setDaoState] = useState<DaoState>();
  const openbook = new Program<OpenbookV2>(OPENBOOK_IDL, OPENBOOK_PROGRAM_ID, provider);
  const openbookTwap = new Program<OpenbookTwap>(
    OPENBOOK_TWAP_IDL,
    OPENBOOK_TWAP_PROGRAM_ID,
    provider,
  );
  const baseNonce: BN = new BN(daoState?.proposalCount || 0);

  useEffect(() => {
    async function fetchState() {
      try {
        console.log('fetch', dao);
        setDaoState(await program.account.dao.fetch(dao));
      } catch (err) {
        console.log(err);
      }
    }

    if (!dao) {
      fetchState();
    }
  }, [dao]);

  const initializeDao = useCallback(async () => {
    if (
      !tokens?.meta?.publicKey ||
      !tokens?.usdc?.publicKey ||
      !wallet?.publicKey ||
      !wallet.signAllTransactions ||
      !connection
    ) {
      return;
    }

    const basePassVault = await initializeVault(daoTreasury, tokens.meta.publicKey, baseNonce);

    const quotePassVault = await initializeVault(
      daoTreasury,
      tokens.usdc.publicKey,
      baseNonce.or(new BN(1).shln(63)),
    );

    const baseFailVault = await initializeVault(
      daoTreasury,
      tokens.meta.publicKey,
      baseNonce.or(new BN(1).shln(62)),
    );

    const quoteFailVault = await initializeVault(
      daoTreasury,
      tokens.usdc.publicKey,
      baseNonce.or(new BN(3).shln(62)),
    );

    const openbookPassMarketKP = Keypair.generate();

    const [openbookTwapPassMarket] = PublicKey.findProgramAddressSync(
      [utils.bytes.utf8.encode('twap_market'), openbookPassMarketKP.publicKey.toBuffer()],
      openbookTwap.programId,
    );

    const openbookPassMarket = await createOpenbookMarket(
      openbook,
      wallet.publicKey,
      tokens.meta.publicKey,
      tokens.usdc.publicKey,
      'Pass-Market',
      new BN(100),
      new BN(1e9),
      new BN(0),
      new BN(0),
      new BN(0),
      null,
      null,
      openbookTwapPassMarket,
      null,
      openbookTwapPassMarket,
      { confFilter: 0.1, maxStalenessSlots: 100 },
      openbookPassMarketKP,
    );

    const createPassTwapMarketIx = await openbookTwap.methods
      .createTwapMarket(new BN(1_000))
      .accounts({
        market: openbookPassMarketKP.publicKey,
        twapMarket: openbookTwapPassMarket,
        payer: wallet.publicKey,
      })
      .instruction();

    const openbookFailMarketKP = Keypair.generate();

    const [openbookTwapFailMarket] = PublicKey.findProgramAddressSync(
      [utils.bytes.utf8.encode('twap_market'), openbookFailMarketKP.publicKey.toBuffer()],
      openbookTwap.programId,
    );

    const openbookFailMarket = await createOpenbookMarket(
      openbook,
      wallet.publicKey,
      tokens.meta.publicKey,
      tokens.usdc.publicKey,
      'fMETA/fUSDC',
      new BN(100),
      new BN(1e9),
      new BN(0),
      new BN(0),
      new BN(0),
      null,
      null,
      openbookTwapFailMarket,
      null,
      openbookTwapFailMarket,
      { confFilter: 0.1, maxStalenessSlots: 100 },
      openbookFailMarketKP,
    );

    const createFailTwapMarketIx = await openbookTwap.methods
      .createTwapMarket(new BN(1_000))
      .accounts({
        market: openbookFailMarketKP.publicKey,
        twapMarket: openbookTwapFailMarket,
        payer: wallet.publicKey,
      })
      .instruction();

    const txs: Transaction[] = [];

    const baseVaultTx = new Transaction().add(basePassVault.tx, baseFailVault.tx);
    const quoteVaultTx = new Transaction().add(quotePassVault.tx, quoteFailVault.tx);

    const daoTx = new Transaction().add(
      await program.methods
        .initializeDao()
        .accounts({
          dao,
          metaMint: tokens.meta.publicKey,
          usdcMint: tokens.usdc.publicKey,
        })
        .instruction(),
    );

    const passMarketTx = new Transaction().add(...openbookPassMarket.instructions);
    const failMarketTx = new Transaction().add(...openbookFailMarket.instructions);
    const twapsTx = new Transaction().add(createPassTwapMarketIx, createFailTwapMarketIx);

    const blockhask = await connection.getLatestBlockhash();
    baseVaultTx.feePayer = wallet.publicKey!;
    baseVaultTx.recentBlockhash = blockhask.blockhash;
    quoteVaultTx.feePayer = wallet.publicKey!;
    quoteVaultTx.recentBlockhash = blockhask.blockhash;
    daoTx.feePayer = wallet.publicKey!;
    daoTx.recentBlockhash = blockhask.blockhash;
    twapsTx.feePayer = wallet.publicKey!;
    twapsTx.recentBlockhash = blockhask.blockhash;
    passMarketTx.feePayer = wallet.publicKey!;
    passMarketTx.recentBlockhash = blockhask.blockhash;
    failMarketTx.feePayer = wallet.publicKey!;
    failMarketTx.recentBlockhash = blockhask.blockhash;

    baseVaultTx.sign(...basePassVault.signers, ...baseFailVault.signers);
    quoteVaultTx.sign(...quotePassVault.signers, ...quoteFailVault.signers);
    passMarketTx.sign(...openbookPassMarket.signers, openbookPassMarketKP);
    failMarketTx.sign(...openbookFailMarket.signers, openbookFailMarketKP);

    txs.push(passMarketTx, failMarketTx);
    txs.push(baseVaultTx, quoteVaultTx);
    txs.push(daoTx);

    const signedTxs = await wallet.signAllTransactions(txs);
    await Promise.all(
      signedTxs.map((tx) => connection.sendRawTransaction(tx.serialize(), { skipPreflight: true })),
    );
  }, [program, dao, wallet, baseNonce, tokens, connection]);

  const initializeProposal = useCallback(async () => {
    // if (!wallet?.publicKey) return;
    // const dummyURL = 'https://www.eff.org/cyberspace-independence';
    // const accounts = [
    //   {
    //     pubkey: dao,
    //     isSigner: true,
    //     isWritable: true,
    //   },
    //   {
    //     pubkey: daoTreasury,
    //     isSigner: true,
    //     isWritable: false,
    //   },
    // ];
    // const data = program.coder.instruction.encode('set_pass_threshold_bps', {
    //   passThresholdBps: 1000,
    // });
    // const instruction = {
    //   programId: program.programId,
    //   accounts,
    //   data,
    // };
    // const proposalKeypair = Keypair.generate();
    // await program.methods
    //   .initializeProposal(dummyURL, instruction)
    //   .preInstructions([await program.account.proposal.createInstruction(proposalKeypair, 1500)])
    //   .accounts({
    //     proposal: proposalKeypair.publicKey,
    //     dao,
    //     daoTreasury,
    //     quotePassVault: quotePassVault.signers[0].publicKey,
    //     quoteFailVault: quoteFailVault.signers[0].publicKey,
    //     basePassVault: basePassVault.signers[0].publicKey,
    //     baseFailVault: baseFailVault.signers[0].publicKey,
    //     openbookTwapPassMarket,
    //     openbookTwapFailMarket,
    //     openbookPassMarket: openbookPassMarketKP.publicKey,
    //     openbookFailMarket: openbookFailMarketKP.publicKey,
    //     proposer: wallet.publicKey,
    //   })
    //   .signers([proposalKeypair])
    //   .rpc({ skipPreflight: true });
  }, []);

  return { program, dao, daoTreasury, initializeDao, initializeProposal };
}
