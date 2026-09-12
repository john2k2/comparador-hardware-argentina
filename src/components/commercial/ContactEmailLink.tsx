'use client';

import { trackContactIntent } from '@/lib/analytics';

type ContactEmailLinkProps = {
  href: string;
  email: string;
  purpose: 'support' | 'commercial';
};

export function ContactEmailLink({ href, email, purpose }: ContactEmailLinkProps) {
  return (
    <a
      href={href}
      className="leading-relaxed normal-case text-[11px] tracking-normal font-mono text-primary underline break-all"
      onClick={() => trackContactIntent({ purpose, channel: 'email', surface: 'contact_page' })}
    >
      {email}
    </a>
  );
}
