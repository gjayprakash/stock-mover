import { useParams } from 'react-router-dom';
import { PageTitle } from './PageTitle';

/** Placeholder from #3. Serves /stores (no id) and /stores/:id. The Store screen issue replaces this body. */
export default function StorePage() {
  const { id } = useParams();
  return <PageTitle title="Stores" sub={id} />;
}
