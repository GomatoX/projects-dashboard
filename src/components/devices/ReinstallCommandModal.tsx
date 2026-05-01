'use client';

// ReinstallCommandModal — flow for surfacing a fresh install command for an
// existing device. Triggered by the key icon on DeviceCard.
//
// Why a fresh token (not a reveal of the old one)?
// The dashboard NEVER stores the raw token (see /api/devices/[id]/regenerate-
// token/route.ts for the rationale). When the user wants to re-run install,
// we mint a new one and invalidate the old. Net effect for the user is the
// same as "show me the command" — they paste it on the device and the agent
// connects again.
//
// Lifecycle:
//   closed → opened → user confirms rotate → POST → tokenData populated → render install
//   close button → reset to closed (token is dropped from React state immediately)
//
// We do not write rawToken to localStorage or any other store. Once this
// modal closes, the only place the raw token exists is wherever the user
// pasted/copied it.

import { useState } from 'react';
import {
  Modal,
  Stack,
  Text,
  Button,
  Group,
  Alert,
  Code,
  Badge,
} from '@mantine/core';
import { IconAlertTriangle, IconKey } from '@tabler/icons-react';
import { notify } from '@/lib/notify';
import { InstallCommand } from './InstallCommand';

interface ReinstallCommandModalProps {
  opened: boolean;
  onClose: () => void;
  deviceId: string;
  deviceName: string;
  /**
   * Device OS (`darwin` | `linux` | …). Used to pick the correct install
   * script. We don't read it from the API response because the response is
   * just a minted-token echo, not a fresh device fetch — passing it from the
   * parent (which already has it) keeps the rotate path one round-trip.
   */
  os: string;
  /** Currently online? Affects the warning copy shown before rotating. */
  isConnected: boolean;
}

interface TokenResponse {
  id: string;
  name: string;
  os: string;
  rawToken: string;
}

export function ReinstallCommandModal({
  opened,
  onClose,
  deviceId,
  deviceName,
  os,
  isConnected,
}: ReinstallCommandModalProps) {
  const [loading, setLoading] = useState(false);
  const [tokenData, setTokenData] = useState<TokenResponse | null>(null);

  const handleClose = () => {
    // Drop the token from memory the moment the modal closes. The browser
    // can still hold a copy in clipboard if the user copied — that's
    // intentional; this just bounds the dashboard's exposure.
    setTokenData(null);
    setLoading(false);
    onClose();
  };

  const handleRotate = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/devices/${deviceId}/regenerate-token`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setTokenData(data as TokenResponse);
    } catch (err) {
      notify({
        color: 'red',
        title: 'Could not generate install command',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={tokenData ? 'Install Command' : 'Generate Install Command'}
      size="lg"
    >
      {tokenData ? (
        <Stack gap="lg">
          <InstallCommand
            rawToken={tokenData.rawToken}
            os={os}
            deviceName={tokenData.name}
          />

          <Badge size="sm" variant="outline" color="yellow">
            Save this command now — closing this dialog drops it from the dashboard.
          </Badge>

          <Group justify="flex-end">
            <Button variant="default" onClick={handleClose}>
              Done
            </Button>
          </Group>
        </Stack>
      ) : (
        <Stack gap="md">
          <Text size="sm">
            Generate a fresh install command for <b>{deviceName}</b>?
          </Text>

          <Alert
            icon={<IconAlertTriangle size={16} />}
            color="yellow"
            variant="light"
            title="This invalidates the old token"
          >
            <Stack gap={6}>
              <Text size="sm">
                The dashboard does not store the original token, so we mint a
                new one and overwrite it. Anything still using the old token
                will fail to reconnect.
              </Text>
              {isConnected && (
                <Text size="sm">
                  This device is currently <b>online</b>. The live socket stays
                  up until it disconnects, but the next reconnect requires the
                  new install command. Re-run it on the device to swap in the
                  new <Code>.env</Code> token.
                </Text>
              )}
            </Stack>
          </Alert>

          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={handleClose} disabled={loading}>
              Cancel
            </Button>
            <Button
              color="blue"
              leftSection={<IconKey size={14} />}
              loading={loading}
              onClick={handleRotate}
            >
              Generate
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
