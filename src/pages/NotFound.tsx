import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="text-center max-w-md">
        <h1 className="font-display text-7xl font-bold text-primary mb-2">404</h1>
        <p className="text-xl text-foreground mb-2">Page not found</p>
        <p className="text-sm text-muted-foreground mb-6">
          The page <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{location.pathname}</code> doesn't exist or has been moved.
        </p>
        <Button asChild>
          <Link to="/">
            <Home className="h-4 w-4 mr-2" />
            Return to Dashboard
          </Link>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
