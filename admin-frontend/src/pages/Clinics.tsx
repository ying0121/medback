import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2, Building2, RefreshCw } from "lucide-react";
import PageHeader from "@/components/admin/PageHeader";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  listClinics,
  createClinic,
  updateClinic,
  deleteClinic,
  syncClinicsFromExternalApi,
  type Clinic
} from "@/lib/api";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

type ClinicForm = Omit<Clinic, "id">;

const EMPTY: ClinicForm = {
  clinicId: "",
  name: "", acronym: "", address1: "", address2: "", state: "", city: "", zip: "",
  tel: "", web: "", portal: "",
};

export default function Clinics() {
  const [data, setData] = useState<Clinic[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Clinic | null>(null);
  const [form, setForm] = useState<ClinicForm>(EMPTY);
  const [confirmDelete, setConfirmDelete] = useState<Clinic | null>(null);
  const [syncingExternal, setSyncingExternal] = useState(false);

  const refresh = () => listClinics().then(setData);
  useEffect(() => { refresh(); }, []);

  const openCreate = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (c: Clinic) => {
    setEditing(c);
    const { id, ...rest } = c;
    setForm({ ...EMPTY, ...rest });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error("Name is required");
    if (editing) {
      await updateClinic(editing.id, form);
      toast.success("Clinic updated");
    } else {
      await createClinic(form);
      toast.success("Clinic added");
    }
    setOpen(false);
    refresh();
  };

  const onDelete = async () => {
    if (!confirmDelete) return;
    await deleteClinic(confirmDelete.id);
    toast.success("Clinic deleted");
    setConfirmDelete(null);
    refresh();
  };

  const onSyncExternal = async () => {
    try {
      setSyncingExternal(true);
      const result = await syncClinicsFromExternalApi();
      toast.success(
        `Clinics synced. Created ${result.created}, skipped ${result.skipped}.`
      );
      refresh();
    } catch (err: any) {
      toast.error(err?.message || "Failed to sync clinics from external API.");
    } finally {
      setSyncingExternal(false);
    }
  };

  const columns: Column<Clinic>[] = [
    {
      key: "name", header: "Clinic", searchable: (r) => `${r.name} ${r.acronym} ${r.clinicId}`,
      render: (r) => (
        <div className="flex items-center gap-3 min-w-[220px]">
          <div className="h-10 w-10 rounded-lg bg-gradient-primary flex items-center justify-center text-primary-foreground shrink-0">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="font-medium truncate">{r.name}</div>
            <div className="text-xs text-muted-foreground">{r.acronym} · {r.clinicId}</div>
          </div>
        </div>
      ),
    },
    { key: "address", header: "Address", searchable: (r) => `${r.address1} ${r.city} ${r.state}`, render: (r) => (
      <div className="text-sm">
        <div>{r.address1}{r.address2 ? `, ${r.address2}` : ""}</div>
        <div className="text-muted-foreground text-xs">{r.city}, {r.state} {r.zip}</div>
      </div>
    )},
    { key: "tel", header: "Phone", searchable: (r) => r.tel, render: (r) => <span className="font-mono text-xs">{r.tel}</span> },
    { key: "web", header: "Web", searchable: (r) => r.web ?? "", render: (r) => r.web ? (
      <a href={r.web} target="_blank" rel="noreferrer" className="text-primary hover:underline text-sm truncate inline-block max-w-[180px]">{r.web}</a>
    ) : <span className="text-muted-foreground text-sm">—</span> },
    { key: "actions", header: "", className: "w-32 text-right", searchable: () => "", render: (r) => (
      <div className="flex items-center justify-end gap-1">
        <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" onClick={() => setConfirmDelete(r)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
      </div>
    )},
  ];

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      <PageHeader
        title="Clinic Management"
        description="Add, update and remove clinics in the network."
        actions={(
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onSyncExternal} disabled={syncingExternal}>
              <RefreshCw className={`h-4 w-4 mr-1 ${syncingExternal ? "animate-spin" : ""}`} />
              {syncingExternal ? "Syncing..." : "Import from API"}
            </Button>
            <Button onClick={openCreate} className="bg-gradient-primary text-primary-foreground">
              <Plus className="h-4 w-4 mr-1" /> Add clinic
            </Button>
          </div>
        )}
      />

      <DataTable
        data={data}
        columns={columns}
        rowKey={(r) => r.id}
        searchPlaceholder="Search clinics by name, city, ID…"
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] min-h-0 overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit clinic" : "Add new clinic"}</DialogTitle>
            <DialogDescription>
              Set clinic information including editable clinic ID.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 min-h-0 -mx-6 px-6">
          <div className="grid grid-cols-2 gap-4 py-2 pr-2">
            <Field label="Clinic ID">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={form.clinicId}
                onChange={(e) => setForm({ ...form, clinicId: e.target.value.replace(/[^\d]/g, "") })}
                placeholder="e.g. 1001"
              />
            </Field>
            <Field label="Name *"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Acronym"><Input value={form.acronym} onChange={(e) => setForm({ ...form, acronym: e.target.value })} /></Field>
            <Field label="Address 1" className="col-span-2"><Input value={form.address1} onChange={(e) => setForm({ ...form, address1: e.target.value })} /></Field>
            <Field label="Address 2" className="col-span-2"><Input value={form.address2 ?? ""} onChange={(e) => setForm({ ...form, address2: e.target.value })} /></Field>
            <Field label="City"><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
            <Field label="State"><Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></Field>
            <Field label="ZIP"><Input value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} /></Field>
            <Field label="Tel"><Input value={form.tel} onChange={(e) => setForm({ ...form, tel: e.target.value })} /></Field>
            <Field label="Web"><Input value={form.web ?? ""} onChange={(e) => setForm({ ...form, web: e.target.value })} /></Field>
            <Field label="Portal" className="col-span-2"><Input value={form.portal ?? ""} onChange={(e) => setForm({ ...form, portal: e.target.value })} /></Field>
          </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} className="bg-gradient-primary text-primary-foreground">{editing ? "Save changes" : "Create clinic"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete clinic?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove <strong>{confirmDelete?.name}</strong>. This action cannot be undone.
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
