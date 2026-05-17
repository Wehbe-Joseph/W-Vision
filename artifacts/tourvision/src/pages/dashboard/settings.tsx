import { useState } from "react";
import { useGetUserProfile, useUpdateUserProfile } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Mail, Phone, Shield, Palette, Camera } from "lucide-react";

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

  if (isLoading) return <div className="p-6"><Skeleton className="h-[600px] rounded-2xl" /></div>;

  return (
    <div className="relative p-6 max-w-6xl mx-auto w-full space-y-6">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-16 -right-16 h-72 w-72 rounded-full bg-gradient-to-br from-violet-200/35 to-transparent blur-3xl" />
      </div>

      <div className="relative rounded-3xl border border-zinc-200 bg-white/90 backdrop-blur p-6 shadow-[0_10px_30px_-18px_rgba(0,0,0,0.45)]">
        <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-[#f5f4ef] px-3 py-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
            Settings
          </span>
        </div>
        <h1 className="mt-3 text-3xl md:text-4xl font-semibold tracking-tight text-zinc-900">Account & Preferences</h1>
        <p className="text-zinc-500 mt-1 text-sm">
          Manage your profile details and workspace preferences.
        </p>
      </div>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="grid w-full grid-cols-4 rounded-2xl bg-white border border-zinc-200 mb-6 p-1 h-auto">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="branding">Branding</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>
        
        <TabsContent value="profile">
          <Card className="bg-white border-zinc-200 rounded-2xl shadow-[0_14px_28px_-20px_rgba(0,0,0,0.5)]">
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>Update your personal details here.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-6">
                <Avatar className="w-20 h-20 border border-zinc-200">
                  <AvatarFallback className="text-2xl bg-zinc-900 text-white">
                    {name?.substring(0,2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <Button variant="outline" className="rounded-xl border-zinc-300">
                  <Camera className="w-4 h-4 mr-2" />
                  Change Avatar
                </Button>
              </div>
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input value={name} onChange={e => setName(e.target.value)} className="bg-[#faf9f5] border-zinc-300 rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label>Email (Cannot be changed)</Label>
                  <Input value={email} disabled className="bg-zinc-100 border-zinc-200 opacity-70 rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label>WhatsApp Number</Label>
                  <Input value={whatsapp} onChange={e => setWhatsapp(e.target.value)} className="bg-[#faf9f5] border-zinc-300 rounded-xl" />
                </div>
              </div>
            </CardContent>
            <CardFooter className="border-t border-zinc-200 pt-6">
              <Button onClick={handleSaveProfile} className="rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 font-semibold" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
           <Card className="bg-white border-zinc-200 rounded-2xl shadow-[0_14px_28px_-20px_rgba(0,0,0,0.5)]">
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>Notification channels are based on your saved contact details.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-xl border border-zinc-200 bg-[#faf9f5] px-4 py-3 flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="inline-flex items-center gap-2">
                    <Mail className="w-4 h-4 text-zinc-500" />
                    <Label>Email Alerts</Label>
                  </div>
                  <p className="text-sm text-muted-foreground">{profile?.email || "No email configured"}</p>
                </div>
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  {profile?.email ? "Enabled" : "Unavailable"}
                </span>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-[#faf9f5] px-4 py-3 flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="inline-flex items-center gap-2">
                    <Phone className="w-4 h-4 text-zinc-500" />
                    <Label>WhatsApp Alerts</Label>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {profile?.whatsappNumber || "No WhatsApp number configured"}
                  </p>
                </div>
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  {profile?.whatsappNumber ? "Enabled" : "Unavailable"}
                </span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="branding">
           <Card className="bg-white border-zinc-200 rounded-2xl shadow-[0_14px_28px_-20px_rgba(0,0,0,0.5)] relative overflow-hidden">
            <CardHeader>
              <CardTitle>Custom Branding</CardTitle>
              <CardDescription>Branding fields are not configured in your current workspace yet.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-xl border border-zinc-200 bg-[#faf9f5] p-5">
                <div className="inline-flex items-center gap-2 mb-2">
                  <Palette className="w-4 h-4 text-zinc-500" />
                  <Label>Agency Logo</Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  Logo uploads will appear here once branding endpoints are enabled.
                </p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-[#faf9f5] p-5">
                <Label>Primary Brand Color</Label>
                <div className="mt-2 text-sm text-muted-foreground">
                  No custom brand color set.
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="security">
          <Card className="bg-white border-zinc-200 rounded-2xl shadow-[0_14px_28px_-20px_rgba(0,0,0,0.5)] border-destructive/30">
            <CardHeader>
              <CardTitle className="text-destructive inline-flex items-center gap-2">
                <Shield className="w-4 h-4" />
                Danger Zone
              </CardTitle>
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