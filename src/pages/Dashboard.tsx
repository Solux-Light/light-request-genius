import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Lightbulb, LogOut, Send, FileText, Plus } from 'lucide-react';
import RequestsList from '@/components/RequestsList';

const Dashboard = () => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [form, setForm] = useState({
    project_name: '',
    location: '',
    space_type: '',
    area_sqm: '',
    ceiling_height: '',
    lighting_goals: '',
    notes: '',
  });

  const spaceTypes = [
    'Office', 'Retail', 'Hospitality', 'Healthcare', 'Education',
    'Residential', 'Industrial', 'Museum / Gallery', 'Restaurant', 'Other',
  ];

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.from('lighting_study_requests').insert({
        user_id: user?.id,
        project_name: form.project_name,
        location: form.location,
        space_type: form.space_type,
        area_sqm: parseFloat(form.area_sqm) || null,
        ceiling_height: parseFloat(form.ceiling_height) || null,
        lighting_goals: form.lighting_goals,
        notes: form.notes || null,
        status: 'pending',
      });
      if (error) throw error;
      toast({ title: 'Request submitted', description: 'Your lighting study request has been submitted successfully.' });
      setForm({ project_name: '', location: '', space_type: '', area_sqm: '', ceiling_height: '', lighting_goals: '', notes: '' });
      setShowForm(false);
      setRefreshKey((k) => k + 1);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto flex items-center justify-between h-16 px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Lightbulb className="h-5 w-5 text-primary" />
            </div>
            <span className="font-semibold text-lg tracking-tight">Solux Lighting</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:inline">{user?.email}</span>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4 mr-1.5" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Lighting Study Requests</h1>
            <p className="text-muted-foreground mt-1">Submit and track your lighting study requests</p>
          </div>
          <Button onClick={() => setShowForm(!showForm)}>
            {showForm ? (
              <>
                <FileText className="h-4 w-4 mr-1.5" />
                View Requests
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-1.5" />
                New Request
              </>
            )}
          </Button>
        </div>

        {showForm ? (
          <Card className="shadow-sm border-border/50">
            <CardHeader>
              <CardTitle className="text-xl">New Lighting Study Request</CardTitle>
              <CardDescription>Provide details about your space for a professional lighting study</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <Label htmlFor="project_name">Project Name *</Label>
                    <Input id="project_name" placeholder="e.g. Downtown Office Renovation" value={form.project_name} onChange={(e) => handleChange('project_name', e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="location">Location *</Label>
                    <Input id="location" placeholder="e.g. New York, NY" value={form.location} onChange={(e) => handleChange('location', e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="space_type">Space Type *</Label>
                    <Select value={form.space_type} onValueChange={(v) => handleChange('space_type', v)}>
                      <SelectTrigger><SelectValue placeholder="Select space type" /></SelectTrigger>
                      <SelectContent>
                        {spaceTypes.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="area_sqm">Area (m²)</Label>
                      <Input id="area_sqm" type="number" placeholder="150" value={form.area_sqm} onChange={(e) => handleChange('area_sqm', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ceiling_height">Ceiling (m)</Label>
                      <Input id="ceiling_height" type="number" step="0.1" placeholder="3.0" value={form.ceiling_height} onChange={(e) => handleChange('ceiling_height', e.target.value)} />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lighting_goals">Lighting Goals *</Label>
                  <Textarea id="lighting_goals" placeholder="Describe the desired ambiance, functional requirements, energy targets, etc." value={form.lighting_goals} onChange={(e) => handleChange('lighting_goals', e.target.value)} required rows={3} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Additional Notes</Label>
                  <Textarea id="notes" placeholder="Any additional information or special requirements..." value={form.notes} onChange={(e) => handleChange('notes', e.target.value)} rows={2} />
                </div>
                <div className="flex gap-3 pt-2">
                  <Button type="submit" disabled={loading || !form.space_type}>
                    <Send className="h-4 w-4 mr-1.5" />
                    {loading ? 'Submitting...' : 'Submit Request'}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : (
          <RequestsList key={refreshKey} />
        )}
      </main>
    </div>
  );
};

export default Dashboard;
