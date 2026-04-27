import { permanentRedirect } from 'next/navigation';

export default function DevicesSetupRedirectPage() {
  permanentRedirect('/guides/device-setup');
}
