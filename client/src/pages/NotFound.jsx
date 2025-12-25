export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="text-5xl font-bold mb-3">404</div>
        <div className="text-muted mb-6">Page not found</div>
        <a className="btn" href="/">Back to Home</a>
      </div>
    </div>
  );
}
