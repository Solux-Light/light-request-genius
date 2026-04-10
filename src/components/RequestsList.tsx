import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Ruler, ArrowUpFromLine, Calendar } from 'lucide-react';

interface Request {
  id: string;
  project_name: string;
  location: string;
  space_type: string;
  area_sqm: number | null;
  ceiling_height: number | null;
  lighting_goals: string;
  notes: string | null;
  status: string;
  created_at: string;
}

const statusColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  in_progress: 'bg-blue-100 text-blue-800 border-blue-200',
  completed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  cancelled: 'bg-red-100 text-red-800 border-red-200',
};

const RequestsList = () => {
  const { user } = useAuth();
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRequests = async () => {
      if (!user) return;
      const { data, error } = await supabase
        .from('lighting_study_requests')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (!error && data) setRequests(data as Request[]);
      setLoading(false);
    };

    fetchRequests();
  }, [user]);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <Card className="border-dashed border-2 border-border/50">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <ArrowUpFromLine className="h-6 w-6 text-primary" />
          </div>
          <h3 className="font-medium text-lg mb-1">No requests yet</h3>
          <p className="text-muted-foreground text-sm">Submit your first lighting study request to get started.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {requests.map((req) => (
        <Card key={req.id} className="shadow-sm border-border/50 hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-semibold text-base">{req.project_name}</h3>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-0.5">
                  <MapPin className="h-3.5 w-3.5" />
                  {req.location}
                </div>
              </div>
              <Badge variant="outline" className={statusColors[req.status] || ''}>
                {req.status.replace('_', ' ')}
              </Badge>
            </div>
            <p className="text-sm text-foreground/80 mb-3 line-clamp-2">{req.lighting_goals}</p>
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="bg-secondary px-2 py-1 rounded-md">{req.space_type}</span>
              {req.area_sqm && (
                <span className="flex items-center gap-1">
                  <Ruler className="h-3 w-3" /> {req.area_sqm} m²
                </span>
              )}
              {req.ceiling_height && (
                <span className="flex items-center gap-1">
                  <ArrowUpFromLine className="h-3 w-3" /> {req.ceiling_height}m ceiling
                </span>
              )}
              <span className="flex items-center gap-1 ml-auto">
                <Calendar className="h-3 w-3" />
                {new Date(req.created_at).toLocaleDateString()}
              </span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default RequestsList;
