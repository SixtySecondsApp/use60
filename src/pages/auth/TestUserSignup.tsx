/**
 * Stub: TestUserSignup page was removed during cleanup.
 * Redirects to login.
 */
import { Navigate } from 'react-router-dom';

export default function TestUserSignup() {
  return <Navigate to="/auth/login" replace />;
}
