import { useEffect, useState, type ReactNode } from "react";
import { Pencil, Plus, Trash2, Upload } from "lucide-react";
import PageHeader from "@/components/admin/PageHeader";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  listDoctors,
  createDoctor,
  updateDoctor,
  deleteDoctor,
  type Doctor,
  type DoctorGender,
  type DoctorInput,
} from "@/lib/api";
import { toast } from "sonner";

const EMPTY: DoctorInput = {
  firstName: "",
  lastName: "",
  gender: "Other",
  phone: "",
  email: "",
  language: "English",
  address1: "",
  address2: "",
  photo: "",
  status: "active",
};

const LANGUAGE_OPTIONS = [
  "English",
  "Spanish",
  "Korean",
  "Chinese",
  "Vietnamese",
  "Tagalog",
  "Arabic",
  "Other",
];

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="text-xs text-muted-foreground mb-1.5 block">{label}</Label>
      {children}
    </div>
  );
}

export default function Doctors() {
  const [data, setData] = useState<Doctor[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Doctor | null>(null);
  const [form, setForm] = useState<DoctorInput>(EMPTY);
  const [confirmDelete, setConfirmDelete] = useState<Doctor | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = () => listDoctors().then(setData).catch((err) => toast.error(err.message));
  useEffect(() => {
    refresh();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  };

  const openEdit = (d: Doctor) => {
    setEditing(d);
    setForm({
      firstName: d.firstName,
      lastName: d.lastName,
      gender: d.gender,
      phone: d.phone,
      email: d.email,
      language: d.language || "English",
      address1: d.address1,
      address2: d.address2,
      photo: d.photo || "",
      status: d.status,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      return toast.error("First & last name required");
    }
    setSaving(true);
    try {
      if (editing) {
        await updateDoctor(editing.id, form);
        toast.success("Doctor updated");
      } else {
        await createDoctor(form);
        toast.success("Doctor added");
      }
      setOpen(false);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteDoctor(confirmDelete.id);
      toast.success("Doctor deleted");
      setConfirmDelete(null);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const onPhotoUpload = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      return toast.error("Please choose an image file.");
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      if (!dataUrl) return;
      const img = new Image();
      img.onload = () => {
        if (img.width > 360 || img.height > 360) {
          toast.error("Photo must be 360 × 360 or smaller.");
          return;
        }
        setForm((f) => ({ ...f, photo: dataUrl }));
      };
      img.onerror = () => toast.error("Invalid image file.");
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const columns: Column<Doctor>[] = [
    {
      key: "name",
      header: "Doctor",
      searchable: (r) => `${r.firstName} ${r.lastName} ${r.email}`,
      render: (r) => (
        <div className="flex items-center gap-3 min-w-[220px]">
          <div className="h-10 w-10 rounded-full bg-gradient-accent flex items-center justify-center text-accent-foreground font-semibold text-sm shrink-0 overflow-hidden">
            {r.photo ? (
              <img src={r.photo} alt="" className="h-10 w-10 object-cover" />
            ) : (
              `${(r.firstName[0] || "").toUpperCase()}${(r.lastName[0] || "").toUpperCase()}`
            )}
          </div>
          <div className="min-w-0">
            <div className="font-medium truncate">
              {r.firstName} {r.lastName}
            </div>
            <div className="text-xs text-muted-foreground truncate">{r.email || "No email"}</div>
          </div>
        </div>
      ),
    },
    {
      key: "gender",
      header: "Gender",
      searchable: (r) => r.gender,
      render: (r) => <span className="text-sm">{r.gender}</span>,
    },
    {
      key: "language",
      header: "Language",
      searchable: (r) => r.language,
      render: (r) => <span className="text-sm">{r.language || "—"}</span>,
    },
    {
      key: "phone",
      header: "Phone",
      searchable: (r) => r.phone,
      render: (r) => <span className="font-mono text-xs">{r.phone || "—"}</span>,
    },
    {
      key: "address",
      header: "Address",
      searchable: (r) => `${r.address1} ${r.address2}`,
      render: (r) => (
        <span className="text-sm text-muted-foreground line-clamp-2 max-w-[240px]">
          {[r.address1, r.address2].filter(Boolean).join(", ") || "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      searchable: (r) => r.status,
      render: (r) => (
        <Badge variant={r.status === "active" ? "default" : "secondary"}>{r.status}</Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-24 text-right",
      searchable: () => "",
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          <Button size="icon" variant="ghost" onClick={() => openEdit(r)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => setConfirmDelete(r)}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      <PageHeader
        title="Doctors"
        description="Manage doctor profiles, contact details, and photos."
        actions={
          <Button onClick={openCreate} className="bg-gradient-primary text-primary-foreground">
            <Plus className="h-4 w-4 mr-1" /> Add doctor
          </Button>
        }
      />

      <DataTable
        data={data}
        columns={columns}
        rowKey={(r) => r.id}
        searchPlaceholder="Search by name, email, language…"
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] min-h-0 overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit doctor" : "Add doctor"}</DialogTitle>
            <DialogDescription>
              Photo must be 360 × 360 pixels or smaller.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 min-h-0 -mx-6 px-6">
            <div className="grid grid-cols-12 gap-4 py-2 pr-2">
              <div className="col-span-12 md:col-span-4 rounded-lg border border-border p-4">
                <Label className="text-xs text-muted-foreground mb-3 block">Photo</Label>
                <div className="mx-auto mb-3 h-28 w-28 rounded-full bg-muted overflow-hidden flex items-center justify-center">
                  {form.photo ? (
                    <img src={form.photo} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-2xl text-muted-foreground">DR</span>
                  )}
                </div>
                <Label htmlFor="doctor-photo-upload" className="cursor-pointer">
                  <div className="inline-flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm hover:bg-muted">
                    <Upload className="h-4 w-4" /> Upload photo
                  </div>
                </Label>
                <Input
                  id="doctor-photo-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => onPhotoUpload(e.target.files?.[0] || null)}
                />
                {form.photo ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-2 w-full text-muted-foreground"
                    onClick={() => setForm((f) => ({ ...f, photo: "" }))}
                  >
                    Remove photo
                  </Button>
                ) : null}
                <p className="mt-2 text-[11px] text-muted-foreground">Max size 360 × 360</p>
              </div>

              <div className="col-span-12 md:col-span-8 grid grid-cols-12 gap-4">
                <Field label="First name *" className="col-span-12 md:col-span-6">
                  <Input
                    value={form.firstName}
                    onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  />
                </Field>
                <Field label="Last name *" className="col-span-12 md:col-span-6">
                  <Input
                    value={form.lastName}
                    onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  />
                </Field>
                <Field label="Gender" className="col-span-12 md:col-span-6">
                  <Select
                    value={form.gender}
                    onValueChange={(v) => setForm({ ...form, gender: v as DoctorGender })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-[80]">
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Female">Female</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Language" className="col-span-12 md:col-span-6">
                  <Input
                    list="doctor-language-options"
                    value={form.language}
                    onChange={(e) => setForm({ ...form, language: e.target.value })}
                    placeholder="e.g. English"
                  />
                  <datalist id="doctor-language-options">
                    {LANGUAGE_OPTIONS.map((lang) => (
                      <option key={lang} value={lang} />
                    ))}
                  </datalist>
                </Field>
                <Field label="Phone" className="col-span-12 md:col-span-6">
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </Field>
                <Field label="Email" className="col-span-12 md:col-span-6">
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </Field>
                <Field label="Status" className="col-span-12 md:col-span-6">
                  <Select
                    value={form.status}
                    onValueChange={(v) =>
                      setForm({ ...form, status: v as Doctor["status"] })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-[80]">
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <Field label="Address 1" className="col-span-12">
                <Input
                  value={form.address1}
                  onChange={(e) => setForm({ ...form, address1: e.target.value })}
                />
              </Field>
              <Field label="Address 2" className="col-span-12">
                <Input
                  value={form.address2}
                  onChange={(e) => setForm({ ...form, address2: e.target.value })}
                />
              </Field>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving} className="bg-gradient-primary text-primary-foreground">
              {saving ? "Saving…" : editing ? "Save changes" : "Add doctor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete doctor?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes {confirmDelete?.firstName} {confirmDelete?.lastName} permanently.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
