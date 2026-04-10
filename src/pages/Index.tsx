import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const Index = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-6">
        <img
          src="/lovable-uploads/d872661a-d41f-4565-9853-2f2195d3f284.png"
          alt="Solux Logo"
          className="h-60 mx-auto"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
        <h1 className="text-4xl font-bold tracking-tight">Welcome to Solux Study Lab +</h1>
        <p className="text-muted-foreground text-lg">Start building your amazing project here!</p>
        <Link to="/solux">
          <Button variant="ghost" className="border border-border px-8 py-3 text-lg">
            Open Solux Form
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default Index;
