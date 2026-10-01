import EmployeeDetailClient from './employee-detail-client';

export async function generateStaticParams() {
  return [{ id: 'default' }];
}

export default function EmployeeDetailPage() {
  return <EmployeeDetailClient />;
}


