import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CalendarIcon } from "lucide-react";
import type { UserInfo, Gender } from "./types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface UserInfoFormProps {
  onSubmit: (info: UserInfo) => void;
}

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

type FormState = {
  name: string;
  gender: Gender | "";
  dob: string;
  email: string;
  phone: string;
  address: string;
};

type FormErrors = Partial<Record<keyof FormState, string>>;

const inputBase =
  "w-full px-3 py-2.5 text-sm rounded-xl border bg-muted/40 text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 transition-all duration-200";

const inputClass = (hasError: boolean) =>
  `${inputBase} ${
    hasError
      ? "border-destructive/60 bg-destructive/5 focus:ring-destructive/40"
      : "border-border/70 hover:border-primary/40 focus:border-primary/60 focus:ring-primary/30"
  }`;

const parseISODate = (value: string): Date | undefined => {
  if (!value) return undefined;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const formatDateForDisplay = (value: string): string => {
  const parsed = parseISODate(value);
  if (!parsed) return "Select date of birth";
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

interface FieldProps {
  label: string;
  error?: string;
  children: React.ReactNode;
}

const Field = ({ label, error, children }: FieldProps) => (
  <div>
    <label className="block text-xs font-medium text-muted-foreground mb-1.5">{label}</label>
    {children}
    {error && <p className="text-xs text-destructive mt-1">{error}</p>}
  </div>
);

const UserInfoForm = ({ onSubmit }: UserInfoFormProps) => {
  const [form, setForm] = useState<FormState>({
    name: "",
    gender: "",
    dob: "",
    email: "",
    phone: "",
    address: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [dobCalendarOpen, setDobCalendarOpen] = useState(false);
  const formContainerRef = useRef<HTMLDivElement | null>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const rootNode = formContainerRef.current?.getRootNode();
    if (rootNode instanceof ShadowRoot) {
      setPortalContainer(rootNode as unknown as HTMLElement);
    } else {
      setPortalContainer(document.body);
    }
  }, []);

  const set =
    (field: keyof FormState) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >,
    ) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
      if (errors[field]) {
        setErrors((prev) => ({ ...prev, [field]: undefined }));
      }
    };

  const validate = (): FormErrors => {
    const e: FormErrors = {};
    if (!form.name.trim()) e.name = "Full name is required";
    if (!form.gender) e.gender = "Please select a gender";
    if (!form.dob) {
      e.dob = "Date of birth is required";
    } else {
      const dobDate = parseISODate(form.dob);
      const now = new Date();
      if (!dobDate || dobDate > now) {
        e.dob = "Please enter a valid date of birth";
      }
    }
    if (!form.email.trim()) {
      e.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      e.email = "Enter a valid email address";
    }
    if (!form.phone.trim()) e.phone = "Phone number is required";
    if (!form.address.trim()) e.address = "Address is required";
    return e;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    onSubmit(form as UserInfo);
  };

  return (
    <motion.div
      ref={formContainerRef}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex-1 overflow-y-auto chat-scrollbar px-4 py-4"
    >
      <div className="text-center mb-5">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center mx-auto mb-3 shadow-lg shadow-primary/20">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            className="text-primary-foreground"
          >
            <path
              d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle
              cx="12"
              cy="7"
              r="4"
              stroke="currentColor"
              strokeWidth="2"
            />
          </svg>
        </div>
        <h4 className="text-sm font-semibold text-foreground">Tell us about yourself</h4>
        <p className="text-xs text-muted-foreground mt-1">
          Your info helps us personalize your care experience
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-3">
        <Field label="Full Name" error={errors.name}>
          <input
            type="text"
            value={form.name}
            onChange={set("name")}
            placeholder="Jane Doe"
            autoComplete="name"
            className={inputClass(!!errors.name)}
          />
        </Field>

        <Field label="Gender" error={errors.gender}>
          <Select
            value={form.gender}
            onValueChange={(value) => {
              setForm((prev) => ({ ...prev, gender: value as Gender }));
              if (errors.gender) {
                setErrors((prev) => ({ ...prev, gender: undefined }));
              }
            }}
          >
            <SelectTrigger
              className={cn(
                inputClass(!!errors.gender),
                "h-11 px-3 [&>span]:text-sm [&>span]:text-left data-[placeholder]:text-muted-foreground/70",
              )}
            >
              <SelectValue placeholder="Select gender" />
            </SelectTrigger>
            <SelectContent
              portalContainer={portalContainer}
              className="rounded-xl border-border/70 bg-card/95 text-foreground backdrop-blur-md"
              position="popper"
            >
              {GENDER_OPTIONS.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  className="rounded-lg text-sm focus:bg-primary/20 focus:text-foreground"
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Date of Birth" error={errors.dob}>
          <Popover open={dobCalendarOpen} onOpenChange={setDobCalendarOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className={cn(
                  inputClass(!!errors.dob),
                  "h-11 justify-between px-3 font-normal bg-muted/40 hover:bg-muted/55",
                  !form.dob && "text-muted-foreground/70",
                )}
              >
                {formatDateForDisplay(form.dob)}
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              portalContainer={portalContainer}
              align="start"
              className="w-auto rounded-xl border-border/70 bg-card/95 p-0 text-foreground backdrop-blur-md"
            >
              <Calendar
                mode="single"
                portalContainer={portalContainer}
                selected={parseISODate(form.dob)}
                onSelect={(date) => {
                  const nextDob = date
                    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
                    : "";
                  setForm((prev) => ({ ...prev, dob: nextDob }));
                  if (errors.dob) {
                    setErrors((prev) => ({ ...prev, dob: undefined }));
                  }
                  setDobCalendarOpen(false);
                }}
                disabled={(date) => date > new Date()}
                captionLayout="dropdown-buttons"
                fromYear={1900}
                toYear={new Date().getFullYear()}
                initialFocus
                className="rounded-xl"
              />
            </PopoverContent>
          </Popover>
          <p className="text-[11px] text-muted-foreground mt-1 px-1">
            Please select your birth date.
          </p>
        </Field>

        <Field label="Email Address" error={errors.email}>
          <input
            type="email"
            value={form.email}
            onChange={set("email")}
            placeholder="you@example.com"
            autoComplete="email"
            className={inputClass(!!errors.email)}
          />
        </Field>

        <Field label="Phone Number" error={errors.phone}>
          <input
            type="tel"
            value={form.phone}
            onChange={set("phone")}
            placeholder="+1 (555) 000-0000"
            autoComplete="tel"
            className={inputClass(!!errors.phone)}
          />
        </Field>

        <Field label="Address" error={errors.address}>
          <textarea
            value={form.address}
            onChange={set("address")}
            placeholder="123 Main St, City, State 00000"
            autoComplete="street-address"
            rows={2}
            className={`${inputClass(!!errors.address)} resize-none`}
          />
        </Field>

        <motion.button
          type="submit"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="w-full py-2.5 mt-1 rounded-xl bg-gradient-to-r from-primary to-accent text-primary-foreground text-sm font-semibold shadow-md shadow-primary/30 transition-opacity"
        >
          Start Chatting
        </motion.button>
      </form>
    </motion.div>
  );
};

export default UserInfoForm;
