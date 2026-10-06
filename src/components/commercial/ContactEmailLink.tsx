'use client';

import { trackContactIntent } from '@/lib/analytics';

type ContactEmailLinkProps = {
  href: string;
  email: string;
  purpose: 'support' | 'commercial' | 'pc_advisory';
  ctaId?: string;
  label?: string;
};

export function ContactEmailLink({ href, email, purpose, ctaId, label }: ContactEmailLinkProps) {
  return (
    <a
      href={href}
      className={`leading-relaxed normal-case text-[12px] tracking-normal font-mono underline break-all ${purpose === 'pc_advisory' ? 'text-secondary' : 'text-primary'}`}
      onClick={() => trackContactIntent({ purpose, channel: 'email', surface: 'contact_page', ctaId })}
    >
      {label ?? email}
    </a>
  );
}
