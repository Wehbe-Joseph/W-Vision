import { useState } from "react";
import { useGetUserProfile, useUpdateUserProfile } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default function Settings() {
  const { data: profile, isLoading } = useGetUserProfile();
  const updateMutation = useUpdateUserProfile();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");

  // Update local state when profile loads
  if (!isLoading && profile && !name && profile.fullName) {
    setName(profile.fullName);
    setEmail(profile.email);
    setWhatsapp(profile.whatsappNumber || "");
  }

  const handleSaveProfile = async () => {
    try {
      await updateMutation.mutateAsync({ data: { fullName: name, whatsappNumber: whatsapp } });
      toast({ title: "Profile updated" });
    } catch (e) {
      toast({ title: "Error updating profile", variant: "destructive" });
    }
  };

  if (isLoading) return <div className="p-6"><Skeleton className="h-[600px] rounded-xl" /></div>;

  return (
    <div className="p-6 max-w-4xl mx-auto w-full">
      <h1 className="text-3xl font-serif font-bold mb-8">Settings</h1>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="grid w-full grid-cols-4 bg-card border border-border mb-8">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="branding">Branding</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>
        
        <TabsContent value="profile">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>Update your personal details here.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-6">
                <Avatar className="w-20 h-20 border border-border">
                  <AvatarFallback className="text-2xl bg-muted text-muted-foreground">{name?.substring(0,2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <Button variant="outline">Change Avatar</Button>
              </div>
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input value={name} onChange={e => setName(e.target.value)} className="bg-background" />
                </div>
                <div className="space-y-2">
                  <Label>Email (Cannot be changed)</Label>
                  <Input value={email} disabled className="bg-muted opacity-50" />
                </div>
                <div className="space-y-2">
                  <Label>WhatsApp Number</Label>
                  <Input value={whatsapp} onChange={e => setWhatsapp(e.target.value)} className="bg-background" />
                </div>
              </div>
            </CardContent>
            <CardFooter className="border-t border-border pt-6">
              <Button onClick={handleSaveProfile} className="bg-primary text-primary-foreground font-bold" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
           <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>Choose how we contact you.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Email Alerts</Label>
                  <p className="text-sm text-muted-foreground">Receive an email when a tour finishes processing.</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>WhatsApp Alerts</Label>
                  <p className="text-sm text-muted-foreground">Receive a message when a tour finishes processing.</p>
                </div>
                <Switch defaultChecked />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="branding">
           <Card className="bg-card border-border relative overflow-hidden">
            {profile?.subscriptionTier === 'free' && (
              <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center p-6 text-center">
                <h3 className="text-xl font-bold mb-2">Pro Feature</h3>
                <p className="text-muted-foreground mb-4">Upgrade to add your agency logo and colors to tours.</p>
                <Button className="bg-primary text-primary-foreground">Upgrade to Pro</Button>
              </div>
            )}
            <CardHeader>
              <CardTitle>Custom Branding</CardTitle>
              <CardDescription>Customize how your tours appear to buyers.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Agency Logo</Label>
                <div className="border-2 border-dashed border-border rounded-xl p-8 text-center text-muted-foreground hover:bg-accent transition-colors cursor-pointer">
                  Click to upload logo
                </div>
              </div>
              <div className="space-y-2">
                <Label>Primary Brand Color</Label>
                <div className="flex gap-4">
                  <Input type="color" defaultValue="#00FF88" className="w-16 h-12 p-1 bg-background" />
                  <Input defaultValue="#00FF88" className="flex-1 bg-background font-mono uppercase" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="security">
          <Card className="bg-card border-border border-destructive/20">
            <CardHeader>
              <CardTitle className="text-destructive">Danger Zone</CardTitle>
              <CardDescription>Irreversible actions.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold">Delete Account</h4>
                  <p className="text-sm text-muted-foreground">Permanently delete your account and all tours.</p>
                </div>
                <Button variant="destructive">Delete Account</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  );
}