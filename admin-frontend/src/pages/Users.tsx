import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2, Check, KeyRound, Upload, Building2 } from "lucide-react";
import PageHeader from "@/components/admin/PageHeader";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  listUsers, createUser, updateUser, deleteUser, listClinics, changeUserPassword,
  type User, type Clinic, type Role, type UserInput,
} from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const EMPTY: Omit<User, "id"> = {
  firstName: "", lastName: "", dob: "", status: "active",
  address: "", state: "", city: "", zip: "", phone: "", email: "",
  role: "Clinic Staff", clinicIds: [], photo: "",
};

const EMPTY_PASSWORD_FORM = { password: "", confirmPassword: "" };

export default function Users() {
  const [data, setData] = useState<User[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState<Omit<User, "id">>(EMPTY);
  const [newPassword, setNewPassword] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<User | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<User | null>(null);
  const [clinicTarget, setClinicTarget] = useState<User | null>(null);
  const [clinicDraft, setClinicDraft] = useState<string[]>([]);
  const [passwordForm, setPasswordForm] = useState(EMPTY_PASSWORD_FORM);

  const refresh = () => listUsers().then(setData);
  useEffect(() => {
    refresh();
    listClinics().then(setClinics);
  }, []);

  const clinicMap = useMemo(() => Object.fromEntries(clinics.map((c) => [c.id, c])), [clinics]);

  const openCreate = () => { setEditing(null); setForm(EMPTY); setNewPassword(""); setOpen(true); };
  const openEdit = (u: User) => {
    setEditing(u);
    const { id, ...rest } = u;
    setForm({ ...EMPTY, ...rest });
    setOpen(true);
  };

  const save = async () => {
    if (!form.firstName.trim() || !form.lastName.trim()) return toast.error("First & last name required");
    if (!form.email.trim()) return toast.error("Email is required");
    if (form.role === "Clinic Staff" && form.clinicIds.length === 0) return toast.error("Assign at least one clinic");
    if (editing) {
      await updateUser(editing.id, form as Partial<UserInput>);
      toast.success("User updated");
    } else {
      if (!newPassword.trim()) return toast.error("Password is required for new user");
      await createUser({ ...form, password: newPassword });
      toast.success("User added");
    }
    setOpen(false);
    refresh();
  };

  const onDelete = async () => {
    if (!confirmDelete) return;
    await deleteUser(confirmDelete.id);
    toast.success("User deleted");
    setConfirmDelete(null);
    refresh();
  };

  const onPhotoUpload = async (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      if (!dataUrl) return;
      const img = new Image();
      img.onload = () => {
        if (img.width > 360 || img.height > 360) {
          alert("Photo must be 360 x 360 or smaller.");
          toast.error("Photo must be 360 x 360 or smaller.");
          return;
        }
        setForm((f) => ({ ...f, photo: dataUrl }));
      };
      img.onerror = () => {
        toast.error("Invalid image file.");
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const openChangePassword = (user: User) => {
    setPasswordTarget(user);
    setPasswordForm(EMPTY_PASSWORD_FORM);
  };

  const openAssignClinics = (user: User) => {
    setClinicTarget(user);
    setClinicDraft([...(user.clinicIds || [])]);
  };

  const toggleClinicDraft = (id: string) => {
    setClinicDraft((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const saveClinicAssignments = async () => {
    if (!clinicTarget) return;
    if (clinicTarget.role === "Clinic Staff" && clinicDraft.length === 0) {
      return toast.error("Assign at least one clinic for Clinic Staff.");
    }
    if (clinicTarget.id === "draft") {
      setForm((prev) => ({ ...prev, clinicIds: clinicDraft }));
      toast.success("Clinic assignments applied");
    } else {
      await updateUser(clinicTarget.id, { clinicIds: clinicDraft });
      toast.success("Clinic assignments updated");
      refresh();
    }
    setClinicTarget(null);
    setClinicDraft([]);
  };

  const savePassword = async () => {
    if (!passwordTarget) return;
    if (!passwordForm.password.trim()) return toast.error("Password is required");
    if (passwordForm.password !== passwordForm.confirmPassword) return toast.error("Password does not match");
    await changeUserPassword(passwordTarget.id, passwordForm.password);
    toast.success("Password changed");
    setPasswordTarget(null);
  };

  const columns: Column<User>[] = [
    {
      key: "name", header: "User",
      searchable: (r) => `${r.firstName} ${r.lastName} ${r.email}`,
      render: (r) => (
        <div className="flex items-center gap-3 min-w-[220px]">
          <div className="h-10 w-10 rounded-full bg-gradient-accent flex items-center justify-center text-accent-foreground font-semibold text-sm shrink-0 overflow-hidden">
            {r.photo ? <img src={r.photo} alt="" className="h-10 w-10 object-cover" /> : `${r.firstName[0]}${r.lastName[0]}`}
          </div>
          <div className="min-w-0">
            <div className="font-medium truncate">{r.firstName} {r.lastName}</div>
            <div className="text-xs text-muted-foreground truncate">{r.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: "role", header: "Role", searchable: (r) => r.role,
      render: (r) => (
        <Badge
          variant="outline"
          className={cn(
            "border-transparent",
            r.role === "Admin"
              ? "bg-gradient-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground"
          )}
        >
          {r.role}
        </Badge>
      ),
    },
    {
      key: "clinics", header: "Clinics", searchable: (r) => r.clinicIds.map((id) => clinicMap[id]?.name ?? "").join(" "),
      render: (r) => (
        <div className="flex flex-wrap gap-1 max-w-[260px]">
          {r.clinicIds.slice(0, 3).map((id) => (
            <Badge key={id} variant="secondary" className="text-xs">
              {clinicMap[id]?.acronym ?? "?"}
            </Badge>
          ))}
          {r.clinicIds.length > 3 && <Badge variant="outline" className="text-xs">+{r.clinicIds.length - 3}</Badge>}
        </div>
      ),
    },
    { key: "status", header: "Status", searchable: (r) => r.status, render: (r) => (
      <Badge variant={r.status === "active" ? "default" : "secondary"}>{r.status}</Badge>
    ) },
    { key: "phone", header: "Phone", searchable: (r) => r.phone, render: (r) => <span className="font-mono text-xs">{r.phone}</span> },
    { key: "loc", header: "Location", searchable: (r) => `${r.city} ${r.state}`, render: (r) => <span className="text-sm text-muted-foreground">{r.city}, {r.state}</span> },
    { key: "actions", header: "", className: "w-40 text-right", searchable: () => "", render: (r) => (
      <div className="flex items-center justify-end gap-1">
        <Button size="icon" variant="ghost" onClick={() => openAssignClinics(r)} title="Assign clinics">
          <Building2 className="h-4 w-4 text-blue-600" />
        </Button>
        <Button size="icon" variant="ghost" onClick={() => openChangePassword(r)} title="Change password">
          <KeyRound className="h-4 w-4 text-amber-600" />
        </Button>
        <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" onClick={() => setConfirmDelete(r)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
      </div>
    )},
  ];

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      <PageHeader
        title="User Management"
        description="Manage administrators and clinic staff with per-clinic access."
        actions={<Button onClick={openCreate} className="bg-gradient-primary text-primary-foreground"><Plus className="h-4 w-4 mr-1" /> Add user</Button>}
      />

      <DataTable
        data={data}
        columns={columns}
        rowKey={(r) => r.id}
        searchPlaceholder="Search by name, email, role, clinic…"
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] min-h-0 overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit user" : "Add new user"}</DialogTitle>
            <DialogDescription>
              Admins have full access. Clinic Staff can only access Dashboard, Topics & Training for their assigned clinics.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 min-h-0 -mx-6 px-6">
          <div className="grid grid-cols-12 gap-4 py-2 pr-2">
            <div className="col-span-12 md:col-span-4 rounded-lg border border-border p-4">
              <Label className="text-xs text-muted-foreground mb-3 block">User photo</Label>
              <div className="mx-auto mb-3 h-28 w-28 rounded-full bg-muted overflow-hidden flex items-center justify-center">
                {form.photo ? <img src={form.photo} alt="" className="h-full w-full object-cover" /> : <span className="text-2xl">👤</span>}
              </div>
              <Label htmlFor="photo-upload" className="cursor-pointer">
                <div className="inline-flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm hover:bg-muted">
                  <Upload className="h-4 w-4" /> Upload photo
                </div>
              </Label>
              <Input id="photo-upload" type="file" accept="image/*" className="hidden" onChange={(e) => onPhotoUpload(e.target.files?.[0] || null)} />
            </div>
            <div className="col-span-12 md:col-span-8 grid grid-cols-12 gap-4">
              <Field label="First name *" className="col-span-12 md:col-span-6"><Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></Field>
              <Field label="Last name *" className="col-span-12 md:col-span-6"><Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></Field>
              <Field label="Email *" className="col-span-12 md:col-span-6"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
              <Field label="Phone" className="col-span-12 md:col-span-6"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
              <Field label="DOB" className="col-span-12 md:col-span-6"><Input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} /></Field>
              <Field label="Status" className="col-span-12 md:col-span-6">
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as User["status"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Address" className="col-span-12"><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
            <Field label="City" className="col-span-12 md:col-span-4"><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
            <Field label="State" className="col-span-12 md:col-span-4"><Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></Field>
            <Field label="ZIP" className="col-span-12 md:col-span-4"><Input value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} /></Field>
            <Field label="Role" className="col-span-12 md:col-span-6">
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as Role })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Admin">Admin (full access)</SelectItem>
                  <SelectItem value="Clinic Staff">Clinic Staff (restricted)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {!editing && (
              <Field label="Password *" className="col-span-12 md:col-span-6">
                <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </Field>
            )}

            <div className="col-span-12 rounded-lg border border-border p-3">
              <Label className="text-xs text-muted-foreground mb-2 block">
                Assigned clinics ({form.clinicIds.length})
                {form.role === "Clinic Staff" && <span className="text-destructive ml-1">*</span>}
              </Label>
              <div className="flex flex-wrap gap-1 mb-2">
                {form.clinicIds.length === 0 ? (
                  <span className="text-xs text-muted-foreground">No clinic selected</span>
                ) : form.clinicIds.map((id) => (
                  <Badge key={id} variant="secondary">{clinicMap[id]?.acronym || id}</Badge>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setClinicDraft([...(form.clinicIds || [])]);
                  setClinicTarget({ id: editing?.id || "draft", ...form });
                }}
              >
                <Building2 className="h-4 w-4 mr-1.5" /> Manage clinics
              </Button>
            </div>
          </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} className="bg-gradient-primary text-primary-foreground">
              {editing ? "Save changes" : "Create user"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!clinicTarget} onOpenChange={(o) => !o && setClinicTarget(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] min-h-0 overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Assign clinics</DialogTitle>
            <DialogDescription>
              Select clinics for {clinicTarget?.firstName} {clinicTarget?.lastName}.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6">
            <div className="sticky top-0 z-10 bg-background flex items-center justify-between py-2 pr-2 border-b border-border/60">
              <div className="text-xs text-muted-foreground">
                Selected {clinicDraft.length} / {clinics.length}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setClinicDraft(clinics.map((c) => c.id))}
                  disabled={clinics.length === 0 || clinicDraft.length === clinics.length}
                >
                  Select all clinics
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setClinicDraft([])}
                  disabled={clinicDraft.length === 0}
                >
                  Clear
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 py-2 pr-2">
              {clinics.map((c) => {
                const checked = clinicDraft.includes(c.id);
                return (
                  <button
                    type="button"
                    key={c.id}
                    onClick={() => toggleClinicDraft(c.id)}
                    className={cn(
                      "flex items-center gap-2 text-left px-3 py-2 rounded-md text-sm transition-colors",
                      checked ? "bg-primary/5 border border-primary/30" : "hover:bg-muted border border-transparent"
                    )}
                  >
                    <span className={cn(
                      "h-4 w-4 rounded border flex items-center justify-center shrink-0",
                      checked ? "bg-primary border-primary text-primary-foreground" : "border-input"
                    )}>
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                    <span className="truncate">{c.name}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{c.acronym}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClinicTarget(null)}>Cancel</Button>
            <Button onClick={saveClinicAssignments}>Save clinics</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!passwordTarget} onOpenChange={(o) => !o && setPasswordTarget(null)}>
        <DialogContent className="max-w-md max-h-[90vh] min-h-0 overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Change password</DialogTitle>
            <DialogDescription>
              Update password for {passwordTarget?.firstName} {passwordTarget?.lastName}.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 min-h-0 -mx-6 px-6">
          <div className="space-y-3 py-2 pr-2">
            <Field label="New password">
              <Input type="password" value={passwordForm.password} onChange={(e) => setPasswordForm((p) => ({ ...p, password: e.target.value }))} />
            </Field>
            <Field label="Confirm password">
              <Input type="password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm((p) => ({ ...p, confirmPassword: e.target.value }))} />
            </Field>
          </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordTarget(null)}>Cancel</Button>
            <Button onClick={savePassword}>Update password</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove <strong>{confirmDelete?.firstName} {confirmDelete?.lastName}</strong> from the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="text-xs text-muted-foreground mb-1.5 block">{label}</Label>
      {children}
    </div>
  );
}
