import { useParams } from 'react-router-dom';
import { PageTitle } from './PageTitle';

/** Placeholder from #3. The Problem screen issue replaces this body. */
export default function ProblemPage() {
  const { id } = useParams();
  return <PageTitle title="Problem" sub={id} />;
}
