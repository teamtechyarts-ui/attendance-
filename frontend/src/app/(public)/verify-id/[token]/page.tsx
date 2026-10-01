import VerifyIdClient from './verify-id-client';

export async function generateStaticParams() {
  return [{ token: 'default' }];
}

export default function VerifyIdPage() {
  return <VerifyIdClient />;
}


