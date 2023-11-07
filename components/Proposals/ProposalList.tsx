'use client';

import { Badge, Button, Card, Group, Stack, Text } from '@mantine/core';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { IconExternalLink, IconEyeglass } from '@tabler/icons-react';
import { useProposals } from '../../hooks/useProposals';
import { shortKey } from '../../lib/utils';

export default function ProposalList() {
  const router = useRouter();
  const { proposals } = useProposals();

  return proposals && proposals.length > 0 ? (
    <Stack>
      {proposals.map((proposal) => (
        <Card key={proposal.publicKey.toString()} shadow="sm" padding="lg" radius="md" withBorder>
          <Stack>
            <Group justify="space-between">
              <Text size="xl" fw={500}>
                Proposal #{proposal.account.number}
              </Text>
              {proposal.account.state.failed ? (
                <Badge color="red" variant="light">
                  Failed
                </Badge>
              ) : proposal.account.state.passed ? (
                <Badge color="green" variant="light">
                  Passed
                </Badge>
              ) : (
                <Badge color="yellow" variant="light">
                  Pending
                </Badge>
              )}
            </Group>
            <Group justify="space-between">
              <Link href={proposal.account.descriptionUrl}>
                <Group gap="sm">
                  <Text>Go to description</Text>
                  <IconExternalLink />
                </Group>
              </Link>
              <Text>Proposed by {shortKey(proposal.account.proposer)}</Text>
            </Group>
            <Button
              variant="default"
              fullWidth
              onClick={() => router.push(`/proposal?id=${proposal.account.number}`)}
            >
              <Group>
                <Text>Details</Text>
                <IconEyeglass />
              </Group>
            </Button>
          </Stack>
        </Card>
      ))}
    </Stack>
  ) : (
    <Text>There are no proposals yet</Text>
  );
}