'use client';

import { useDisclosure } from '@mantine/hooks';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import {
  AppShell,
  Burger,
  Button,
  Flex,
  Group,
  NativeSelect,
  Stack,
  Switch,
  Text,
  Title,
  rem,
  useMantineColorScheme,
  useMantineTheme,
} from '@mantine/core';
import {
  IconBooks,
  IconBrandDiscord,
  IconBrandGithub,
  IconBrandTwitter,
  IconMicroscope,
  IconMoonStars,
  IconSpeakerphone,
  IconSun,
} from '@tabler/icons-react';
import { useWallet } from '@solana/wallet-adapter-react';
import '@mantine/notifications/styles.css';
import Image from 'next/image';
import Link from 'next/link';
import React, { ReactNode, useEffect } from 'react';
import icon from '@/public/meta.jpg';
import { shortKey } from '@/lib/utils';
import { Networks, useNetworkConfiguration } from '../../hooks/useNetworkConfiguration';

interface MenuItem {
  name: string;
  href: string;
  icon: ReactNode;
  debug?: boolean;
}
const menuItems: MenuItem[] = [
  { name: 'Proposals', href: '/proposals', icon: <IconSpeakerphone /> },
  // { name: 'Analytics', href: '/analytics', icon: <IconDeviceDesktopAnalytics /> },
  { name: 'Docs', href: 'https://themetadao.org/', icon: <IconBooks /> },
  { name: 'Debug', href: '/debug', icon: <IconMicroscope />, debug: true },
];

const networks = [
  { label: 'Mainnet', value: Networks.Mainnet.toString() },
  { label: 'Devnet', value: Networks.Devnet.toString() },
  { label: 'Localnet', value: Networks.Localnet.toString() },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const wallet = useWallet();
  const modal = useWalletModal();
  const { network, setNetwork } = useNetworkConfiguration();
  const [opened, { toggle }] = useDisclosure();
  const theme = useMantineTheme();
  const { setColorScheme } = useMantineColorScheme();

  const sunIcon = (
    <IconSun
      style={{ width: rem(16), height: rem(16) }}
      stroke={2.5}
      color={theme.colors.yellow[4]}
    />
  );

  const moonIcon = (
    <IconMoonStars
      style={{ width: rem(16), height: rem(16) }}
      stroke={2.5}
      color={theme.colors.blue[6]}
    />
  );

  useEffect(() => {
    if (!wallet.connected && wallet.wallet) {
      wallet.connect();
    }
  }, [wallet]);

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 300, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Flex justify="space-between" align="center" p="5" w="">
          <Link href="/" style={{ textDecoration: 'none' }}>
            <Flex justify="flex-start" align="center" gap="xs">
              <Image src={icon} alt="App logo" width={48} height={48} />
              <Title c="initial">Futarchy</Title>
            </Flex>
          </Link>
          <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
        </Flex>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <Stack gap={15}>
          <Stack>
            {menuItems.map((item) =>
              item.debug && network === Networks.Mainnet ? null : (
                <Link key={item.href} href={item.href}>
                  <Button variant="default" w="100%" justify="flex-start">
                    {item.icon}
                    <Text>{item.name}</Text>
                  </Button>
                </Link>
              ),
            )}
          </Stack>
          {wallet?.publicKey ? (
            <Button variant="danger" onClick={() => wallet.disconnect()}>
              {shortKey(wallet.publicKey)}
            </Button>
          ) : (
            <Button onClick={() => modal.setVisible(true)}>Connect wallet</Button>
          )}
          <NativeSelect
            label="Network picker"
            data={networks}
            value={network}
            onChange={(e) => setNetwork(e.target.value as Networks)}
          />
          <Group justify="center">
            <Link href="https://github.com/Dodecahedr0x/meta-dao-frontend">
              <IconBrandGithub />
            </Link>
            <Link href="https://discord.gg/metadao">
              <IconBrandDiscord />
            </Link>
            <Link href="https://twitter.com/MetaDAOProject">
              <IconBrandTwitter />
            </Link>
          </Group>
          <Group justify="center">
            <Switch
              size="md"
              color="dark.4"
              onLabel={sunIcon}
              offLabel={moonIcon}
              onChange={(e) => setColorScheme(e.currentTarget.checked ? 'light' : 'dark')}
            />
          </Group>
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
