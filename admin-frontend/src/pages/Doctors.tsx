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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  listDoctors,
  createDoctor,
  updateDoctor,
  deleteDoctor,
  listClinics,
  type Doctor,
  type DoctorGender,
  type DoctorInput,
  type Clinic,
} from "@/lib/api";
import {
  defaultWeeklyHours,
  normalizeDailyLimit,
  normalizeWeeklyHours,
} from "@/lib/scheduleHours";
import WeeklyHoursEditor from "@/components/admin/WeeklyHoursEditor";
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
  clinicId: null,
  weeklyHours: defaultWeeklyHours(),
  slotDurationMinutes: null,
  doctorDailyLimit: null,
};

const LANGUAGE_OPTIONS = [
  "English",
  "Spanish",
  "Chinese (Mandarin)",
  "Chinese (Cantonese)",
  "Korean",
  "Vietnamese",
  "Tagalog",
  "Arabic",
  "Hindi",
  "Portuguese",
  "French",
  "German",
  "Italian",
  "Japanese",
  "Russian",
  "Polish",
  "Ukrainian",
  "Persian (Farsi)",
  "Urdu",
  "Bengali",
  "Turkish",
  "Thai",
  "Indonesian",
  "Malay",
  "Hebrew",
  "Greek",
  "Dutch",
  "Swedish",
  "Norwegian",
  "Danish",
  "Finnish",
  "Romanian",
  "Hungarian",
  "Czech",
  "Slovak",
  "Croatian",
  "Serbian",
  "Bulgarian",
  "Amharic",
  "Somali",
  "Swahili",
  "Haitian Creole",
  "Armenian",
  "Punjabi",
  "Gujarati",
  "Tamil",
  "Telugu",
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
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Doctor | null>(null);
  const [form, setForm] = useState<DoctorInput>(EMPTY);
  const [confirmDelete, setConfirmDelete] = useState<Doctor | null>(null);
  const [saving, setSaving] = useState(false);
  const [formTab, setFormTab] = useState("general");

  const refresh = () => listDoctors().then(setData).catch((err) => toast.error(err.message));
  useEffect(() => {
    refresh();
    listClinics()
      .then(setClinics)
      .catch(() => setClinics([]));
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setFormTab("general");
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
      clinicId: d.clinicId || null,
      weeklyHours: normalizeWeeklyHours(d.weeklyHours),
      slotDurationMinutes: d.slotDurationMinutes ?? null,
      doctorDailyLimit: normalizeDailyLimit(d.doctorDailyLimit),
    });
    setFormTab("general");
    setOpen(true);
  };

  const save = async () => {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      return toast.error("First & last name required");
    }
    const doctorLimit = normalizeDailyLimit(form.doctorDailyLimit);
    setSaving(true);
    try {
      const payload: DoctorInput = {
        ...form,
        clinicId: form.clinicId || null,
        weeklyHours: normalizeWeeklyHours(form.weeklyHours),
        doctorDailyLimit: doctorLimit,
      };
      if (editing) {
        await updateDoctor(editing.id, payload);
        toast.success("Doctor updated");
      } else {
        await createDoctor(payload);
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
      key: "clinic",
      header: "Clinic",
      searchable: (r) => r.clinicName || "",
      render: (r) => (
        <span className="text-sm text-muted-foreground">{r.clinicName || "—"}</span>
      ),
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
    <div className="admin-page">
      <PageHeader
        accent={4}
        title="Doctors"
        description="Manage doctor profiles, clinic assignment, and Bot Calendar schedule overrides."
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
        <DialogContent className="flex max-h-[90vh] min-h-0 max-w-3xl flex-col gap-0 overflow-hidden p-6">
          <DialogHeader className="shrink-0">
            <DialogTitle>{editing ? "Edit doctor" : "Add doctor"}</DialogTitle>
            <DialogDescription>
              Profile details and optional Bot Calendar schedule overrides. Photo max 360 × 360.
            </DialogDescription>
          </DialogHeader>
          <Tabs
            value={formTab}
            onValueChange={setFormTab}
            className="flex flex-1 min-h-0 flex-col gap-0"
          >
            <TabsList className="grid w-full grid-cols-2 shrink-0 mb-3">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="schedule">Schedule</TabsTrigger>
            </TabsList>
            <div
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain -mx-6 px-6 [scrollbar-gutter:stable]"
              role="region"
              aria-label="Doctor form"
            >
              <TabsContent value="general" className="mt-0 focus-visible:ring-0">
                <div className="grid grid-cols-12 gap-4 py-2 pr-2 pb-4">
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
                      <Select
                        value={
                          LANGUAGE_OPTIONS.filter((l) => l !== "Other").includes(form.language)
                            ? form.language
                            : "Other"
                        }
                        onValueChange={(v) => {
                          if (v === "Other") {
                            const known = LANGUAGE_OPTIONS.filter((l) => l !== "Other");
                            setForm({
                              ...form,
                              language: known.includes(form.language) ? "" : form.language,
                            });
                            return;
                          }
                          setForm({ ...form, language: v });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select language" />
                        </SelectTrigger>
                        <SelectContent className="z-[80] max-h-72">
                          {LANGUAGE_OPTIONS.map((lang) => (
                            <SelectItem key={lang} value={lang}>
                              {lang}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    {!LANGUAGE_OPTIONS.filter((l) => l !== "Other").includes(form.language) ? (
                      <Field label="Custom language" className="col-span-12 md:col-span-6">
                        <Input
                          value={form.language === "Other" ? "" : form.language}
                          placeholder="Type language name"
                          onChange={(e) =>
                            setForm({ ...form, language: e.target.value.trim() || "Other" })
                          }
                        />
                      </Field>
                    ) : null}
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
                    <Field label="Clinic" className="col-span-12 md:col-span-6">
                      <Select
                        value={form.clinicId || "__none__"}
                        onValueChange={(v) =>
                          setForm({ ...form, clinicId: v === "__none__" ? null : v })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Unassigned" />
                        </SelectTrigger>
                        <SelectContent className="z-[80] max-h-72">
                          <SelectItem value="__none__">Unassigned</SelectItem>
                          {clinics.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
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
              </TabsContent>

              <TabsContent value="schedule" className="mt-0 focus-visible:ring-0">
                <div className="space-y-4 py-2 pr-2 pb-4">
                  <div>
                    <div className="font-medium text-sm">Bot Calendar schedule</div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Optional overrides when this doctor is linked to a clinic. Weekly hours use
                      Eastern Time. Leave limits blank to inherit the clinic settings.
                    </p>
                  </div>
                  <WeeklyHoursEditor
                    value={normalizeWeeklyHours(form.weeklyHours)}
                    onChange={(weeklyHours) => setForm({ ...form, weeklyHours })}
                  />
                  <div className="grid grid-cols-12 gap-3">
                    <Field label="Slot duration (minutes)" className="col-span-12 md:col-span-6">
                      <Input
                        type="number"
                        min={5}
                        max={480}
                        placeholder="Inherit clinic"
                        value={form.slotDurationMinutes ?? ""}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            slotDurationMinutes:
                              e.target.value === "" ? null : Number(e.target.value) || null,
                          })
                        }
                      />
                    </Field>
                    <Field label="Doctor daily limit" className="col-span-12 md:col-span-6">
                      <Input
                        type="number"
                        min={1}
                        placeholder="e.g. 20"
                        value={form.doctorDailyLimit ?? ""}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            doctorDailyLimit: e.target.value === "" ? null : Number(e.target.value),
                          })
                        }
                      />
                    </Field>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Doctor daily limit caps Bot Calendar bookings for this day when set. Blank values
                    inherit the clinic settings (slot duration included).
                  </p>
                </div>
              </TabsContent>
            </div>
          </Tabs>
          <DialogFooter className="shrink-0 border-t border-border/60 pt-4 sm:justify-end">
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
