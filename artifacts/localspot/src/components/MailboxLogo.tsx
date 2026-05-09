interface MailboxLogoProps {
  height?: number;
}

export function MailboxLogo({ height = 64 }: MailboxLogoProps) {
  return (
    <img
      src="/mailbox-logo.png"
      alt="My Town Postcard mailbox logo"
      height={height}
      style={{ height, width: "auto", display: "block", flexShrink: 0 }}
    />
  );
}
