import ProjectDetailClient from './project-detail-client';

export async function generateStaticParams() {
  return [{ id: 'default' }];
}

export default function AdminProjectDetailPage() {
  return <ProjectDetailClient />;
}


