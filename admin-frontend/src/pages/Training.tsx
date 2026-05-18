import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, CheckCircle2, Ban, Building2 } from "lucide-react";
import PageHeader from "@/components/admin/PageHeader";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  listClinics,
  listKnowledge,
  createKnowledge,
  updateKnowledge,
  toggleKnowledgeStatus,
  deleteKnowledge,
  type Clinic,
  type KnowledgeItem
} from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function Training() {
  const { user } = useAuth();
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [filterClinicId, setFilterClinicId] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");
  const [refreshKey, setRefreshKey] = useState(0);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<KnowledgeItem | null>(null);
  const [formClinicId, setFormClinicId] = useState("");
  const [formKnowledge, setFormKnowledge] = useState("");
  const [formStatus, setFormStatus] = useState<"active" | "inactive">("active");
  const [confirmDelete, setConfirmDelete] = useState<KnowledgeItem | null>(null);

  useEffect(() => {
    const allowed = user?.role === "Admin" ? undefined : user?.clinicIds;
    listClinics().then((all) => {
      const filtered = allowed ? all.filter((c) => allowed.includes(c.id)) : all;
      setClinics(filtered);
    });
  }, [user, refreshKey]);

  useEffect(() => {
    const params = {
      clinicId: filterClinicId === "all" ? undefined : filterClinicId,
      status: filterStatus === "all" ? undefined : filterStatus
    };
    listKnowledge(params).then((rows) => {
      const allowed = user?.role === "Admin" ? null : new Set(user?.clinicIds || []);
      const filtered = allowed ? rows.filter((r) => allowed.has(String(r.clinicId))) : rows;
      setItems(filtered);
    });
  }, [filterClinicId, filterStatus, user, refreshKey]);

  const clinicMap = useMemo(() => Object.fromEntries(clinics.map((c) => [String(c.id), c])), [clinics]);

  const openCreate = () => {
    setEditing(null);
    setFormClinicId(clinics[0]?.id || "");
    setFormKnowledge("");
    setFormStatus("active");
    setOpen(true);
  };

  const openEdit = (row: KnowledgeItem) => {
    setEditing(row);
    setFormClinicId(String(row.clinicId));
    setFormKnowledge(row.knowledge || "");
    setFormStatus(row.status);
    setOpen(true);
  };

  const save = async () => {
    if (!formClinicId) return toast.error("Clinic is required.");
    if (!formKnowledge.trim()) return toast.error("Knowledge is required.");

    if (editing) {
      await updateKnowledge(editing.id, {
        clinicId: formClinicId,
        knowledge: formKnowledge.trim(),
        status: formStatus
      });
      toast.success("Knowledge updated");
    } else {
      await createKnowledge({
        clinicId: formClinicId,
        knowledge: formKnowledge.trim(),
        status: formStatus
      });
      toast.success("Knowledge added");
    }
    setOpen(false);
    setRefreshKey((v) => v + 1);
  };

  const onToggleStatus = async (row: KnowledgeItem) => {
    const next = row.status === "active" ? "inactive" : "active";
    await toggleKnowledgeStatus(row.id, next);
    toast.success(`Status changed to ${next}`);
    setRefreshKey((v) => v + 1);
  };

  const onDelete = async () => {
    if (!confirmDelete) return;
    await deleteKnowledge(confirmDelete.id);
    setConfirmDelete(null);
    toast.success("Knowledge deleted");
    setRefreshKey((v) => v + 1);
  };

  const columns: Column<KnowledgeItem>[] = [
    {
      key: "clinic",
      header: "Clinic",
      searchable: (r) => `${clinicMap[String(r.clinicId)]?.name || ""} ${clinicMap[String(r.clinicId)]?.acronym || ""} ${r.clinicId}`,
      render: (r) => {
        const c = clinicMap[String(r.clinicId)];
        return (
          <div className="flex items-center gap-2 min-w-[180px]">
            <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <div className="font-medium truncate">{c?.name || `Clinic ${r.clinicId}`}</div>
              <div className="text-xs text-muted-foreground truncate">{c?.acronym || "-"} · {r.clinicId}</div>
            </div>
          </div>
        );
      }
    },
    {
      key: "knowledge",
      header: "Knowledge",
      searchable: (r) => r.knowledge,
      render: (r) => <div className="max-w-[620px] line-clamp-3 whitespace-pre-wrap">{r.knowledge}</div>
    },
    {
      key: "status",
      header: "Status",
      searchable: (r) => r.status,
      render: (r) => (
        <Badge
          variant="outline"
          className={cn(
            r.status === "active"
              ? "text-success border-success/30 bg-success/10"
              : "text-muted-foreground border-border bg-muted/40"
          )}
        >
          {r.status}
        </Badge>
      )
    },
    {
      key: "actions",
      header: "",
      className: "w-40 text-right",
      searchable: () => "",
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          <Button size="icon" variant="ghost" onClick={() => onToggleStatus(r)} title="Toggle status">
            {r.status === "active" ? (
              <Ban className="h-4 w-4 text-warning" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-success" />
            )}
          </Button>
          <Button size="icon" variant="ghost" onClick={() => openEdit(r)} title="Edit">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => setConfirmDelete(r)} title="Delete">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      )
    }
  ];

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      <PageHeader
        title="Training Model"
        description="Manage knowledge records by clinic for product/training information."
        actions={
          <Button onClick={openCreate} className="bg-gradient-primary text-primary-foreground">
            <Plus className="h-4 w-4 mr-1.5" />
            Add knowledge
          </Button>
        }
      />

      <DataTable
        data={items}
        columns={columns}
        rowKey={(r) => r.id}
        searchPlaceholder="Search knowledge text, clinic…"
        toolbar={
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Select value={filterClinicId} onValueChange={setFilterClinicId}>
              <SelectTrigger className="w-[170px]">
                <SelectValue placeholder="Filter clinic" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All clinics</SelectItem>
                {clinics.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
        emptyMessage="No knowledge records found"
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] min-h-0 overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit knowledge" : "Add knowledge"}</DialogTitle>
            <DialogDescription>
              Save clinic-specific product/training knowledge with active or inactive status.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 min-h-0 -mx-6 px-6">
            <div className="space-y-4 py-2 pr-2">
              <div>
                <Label>Clinic</Label>
                <Select value={formClinicId} onValueChange={setFormClinicId}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Select clinic" />
                  </SelectTrigger>
                  <SelectContent>
                    {clinics.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name} ({c.acronym || c.clinicId})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={formStatus} onValueChange={(v) => setFormStatus(v as "active" | "inactive")}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Knowledge</Label>
                <Textarea
                  value={formKnowledge}
                  onChange={(e) => setFormKnowledge(e.target.value)}
                  rows={10}
                  className="mt-1.5"
                  placeholder="Enter product / training knowledge details..."
                />
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} className="bg-gradient-primary text-primary-foreground">
              {editing ? "Save changes" : "Create knowledge"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete knowledge?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
