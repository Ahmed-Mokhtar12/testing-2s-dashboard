# Edit Member Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Edit Member" tab (with reactivate) to the hotel-training admin panel, backed by a new `update` action in the `sp-manage-colleague` Edge Function.

**Architecture:** The browser never talks to Graph. The admin UI calls the existing `sp-manage-colleague` Supabase Edge Function (app-only Azure creds, server-side admin allowlist), which gains a third `update` action performing one Graph `PATCH` on the `Colleagues_Master` list item. The new `EditMemberForm` React component mirrors the existing Add/Remove forms (react-hook-form + zod, shadcn components, React Query invalidation).

**Tech Stack:** React 18 + TypeScript + Vite, react-hook-form + zod, TanStack Query, shadcn/ui, sonner toasts, Supabase Edge Functions (Deno), Microsoft Graph, Playwright E2E.

**Spec:** `docs/superpowers/specs/2026-07-29-edit-member-design.md`

## Global Constraints

- Editable fields: Name, Position, Department, Section only. **EmployeeID is never editable.**
- Name/Position validation: `/^[A-Za-z ]+$/` (same as AddMemberForm).
- Department change **clears** Section; Section options come from `DEPARTMENT_SECTIONS[department]`.
- The `update` action may set `IsActive: true` (reactivate) but must **never** set `IsActive: false`.
- Edit + reactivate is **one** Graph PATCH.
- Admin gate: reuse the existing `ADMIN_EMAILS` checks verbatim (client cosmetic, server enforcing). No allowlist changes.
- No Postgres/schema changes; historical snapshots untouched.
- Verification commands: `npx tsc -p tsconfig.app.json --noEmit`, `npm run lint`, `npx playwright test tests/hotel-training.spec.ts`.
- No local `deno`/`supabase` CLI: the Edge Function change is verified by review + E2E mocks locally and type-checked at deploy time (Supabase MCP `deploy_edge_function`).

---

### Task 1: Edge Function `update` action

**Files:**
- Modify: `supabase/functions/sp-manage-colleague/index.ts`

**Interfaces:**
- Consumes: existing `graphFetch`, `LIST_IDS.colleagues`, admin gate (unchanged).
- Produces: request arm `{ action: 'update'; itemId: string; patch: ColleaguePatch }` where `ColleaguePatch = { colleagueName: string; position: string; section: string; department: string; reactivate?: boolean }`; response `{ ok: true }`. Task 2's client union must match this exactly.

- [ ] **Step 1: Extend the `Body` type**

Replace lines 14–24 (`interface NewColleague` … `type Body`) with:

```ts
interface NewColleague {
  employeeId: string;
  colleagueName: string;
  position: string;
  section: string;
  department: string;
}

interface ColleaguePatch {
  colleagueName: string;
  position: string;
  section: string;
  department: string;
  reactivate?: boolean;
}

type Body =
  | { action: 'add'; colleague: NewColleague }
  | { action: 'deactivate'; itemId: string }
  | { action: 'update'; itemId: string; patch: ColleaguePatch };
```

- [ ] **Step 2: Add the `update` branch**

Insert between the `deactivate` branch (ends line 95: `return json(req, { ok: true });` + closing `}`) and `return json(req, { error: 'Unknown action.' }, 400);`:

```ts
    if (body.action === 'update') {
      const itemId = body.itemId?.trim();
      if (!itemId || !/^\d+$/.test(itemId)) {
        return json(req, { error: 'itemId must be a numeric SharePoint item id.' }, 400);
      }
      const p = body.patch;
      if (!p?.colleagueName?.trim() || !p.position?.trim() || !p.section?.trim() || !p.department?.trim()) {
        return json(req, { error: 'All colleague fields are required.' }, 400);
      }
      const fields: Record<string, unknown> = {
        Title: p.colleagueName,
        ColleagueName: p.colleagueName,
        Position: p.position,
        Section: p.section,
        Department: p.department,
      };
      // update can only ever reactivate — deactivation stays a separate action
      if (p.reactivate) fields.IsActive = true;
      await graphFetch(
        token,
        `${GRAPH_BASE}/sites/${siteId}/lists/${LIST_IDS.colleagues}/items/${itemId}/fields`,
        { method: 'PATCH', body: JSON.stringify(fields) },
      );
      return json(req, { ok: true });
    }
```

- [ ] **Step 3: Review the diff against the constraints**

Run: `git diff supabase/functions/sp-manage-colleague/index.ts`
Check: no path writes `IsActive: false`; validation mirrors `add`; `Title` stays in sync with the name.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/sp-manage-colleague/index.ts
git commit -m "feat(hotel-training): update action (edit + reactivate) in sp-manage-colleague"
```

---

### Task 2: Client transport union

**Files:**
- Modify: `src/services/sharepoint.ts:89-99`

**Interfaces:**
- Produces: `ColleaguePatchPayload` and the `update` arm of `ManageColleagueRequest`, consumed by Task 4's `EditMemberForm`. Must mirror Task 1's server `ColleaguePatch` field-for-field.

- [ ] **Step 1: Extend the types**

Replace lines 97–99 (`export type ManageColleagueRequest = …`) with:

```ts
export interface ColleaguePatchPayload {
  colleagueName: string;
  position: string;
  section: string;
  department: string;
  reactivate?: boolean;
}

export type ManageColleagueRequest =
  | { action: 'add'; colleague: NewColleaguePayload }
  | { action: 'deactivate'; itemId: string }
  | { action: 'update'; itemId: string; patch: ColleaguePatchPayload };
```

`invokeManageColleague` itself is unchanged.

- [ ] **Step 2: Type-check**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/services/sharepoint.ts
git commit -m "feat(hotel-training): update arm in ManageColleagueRequest"
```

---

### Task 3: Test mocks + failing E2E tests

**Files:**
- Modify: `tests/helpers/hotel-training-mocks.ts:78-92` (`mockManageColleagueFunction`)
- Modify: `tests/hotel-training.spec.ts` (helper `openHotelTraining` + new tests)

**Interfaces:**
- Consumes: `MOCK_COLLEAGUES_FLAT` (`col-1` Alice Smith, Supervisor, Front Office/Reception Hotel, active; `col-4` Dave Black, Staff, Security/Security, **inactive**).
- Produces: `mockManageColleagueFunction(page, { onBody })`; `openHotelTraining(page, email, { onManageBody })`. Task 4 makes these tests pass; UI copy referenced here ("Edit Member", "Save Changes", "Reactivate this member", "Yes, save changes", change lines `Label: old → new`) is binding for Task 4.

- [ ] **Step 1: Give the manage-colleague mock an `onBody` spy**

Replace `mockManageColleagueFunction` (lines 78–92) with:

```ts
export async function mockManageColleagueFunction(
  page: Page,
  opts: { onBody?: (body: unknown) => void } = {},
) {
  await page.route(
    `https://${PROJECT_REF}.supabase.co/functions/v1/sp-manage-colleague`,
    async (route) => {
      if (route.request().method() === 'OPTIONS') {
        return route.fulfill({ status: 200, body: 'ok' });
      }
      const body = route.request().postDataJSON() as { action?: string };
      opts.onBody?.(body);
      if (body?.action === 'add') {
        return route.fulfill({ json: { id: 'col-new' } });
      }
      return route.fulfill({ json: { ok: true } });
    },
  );
}
```

- [ ] **Step 2: Thread `onManageBody` through `openHotelTraining`**

In `tests/hotel-training.spec.ts`, extend the `opts` type of `openHotelTraining` (lines 19–23) with `onManageBody?: (body: unknown) => void;` and change line 30 to:

```ts
  await mockManageColleagueFunction(page, { onBody: opts.onManageBody });
```

- [ ] **Step 3: Add helpers + four tests (bottom of the describe block)**

```ts
  async function openEditMemberTab(page: Page) {
    await page.getByRole('tab', { name: 'Manage Members' }).click();
    await page.getByRole('tab', { name: 'Edit Member' }).click();
  }

  async function pickEditMember(page: Page, search: string, optionName: RegExp) {
    await page.getByRole('button', { name: 'Search by name or Employee ID...' }).click();
    await page.getByPlaceholder('Type name or ID...').fill(search);
    await page.getByRole('option', { name: optionName }).click();
  }

  test('edit member: promotion shows old → new confirmation and sends update patch', async ({ page }) => {
    const bodies: Array<Record<string, unknown>> = [];
    await openHotelTraining(page, ADMIN_EMAIL, { onManageBody: (b) => bodies.push(b as Record<string, unknown>) });
    await openEditMemberTab(page);
    await pickEditMember(page, 'Alice', /Alice Smith/);

    // Nothing changed yet → Save disabled.
    await expect(page.getByRole('button', { name: 'Save Changes' })).toBeDisabled();

    await page.getByLabel('Position').fill('Senior Supervisor');
    await page.getByRole('button', { name: 'Save Changes' }).click();

    await expect(page.getByText('Position: Supervisor → Senior Supervisor')).toBeVisible();
    await page.getByRole('button', { name: 'Yes, save changes' }).click();
    await expect(page.getByText('Member updated successfully.')).toBeVisible();

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toEqual({
      action: 'update',
      itemId: 'col-1',
      patch: {
        colleagueName: 'Alice Smith',
        position: 'Senior Supervisor',
        section: 'Reception Hotel',
        department: 'Front Office',
      },
    });
  });

  test('edit member: department transfer forces re-selecting a valid section', async ({ page }) => {
    const bodies: Array<Record<string, unknown>> = [];
    await openHotelTraining(page, ADMIN_EMAIL, { onManageBody: (b) => bodies.push(b as Record<string, unknown>) });
    await openEditMemberTab(page);
    await pickEditMember(page, '1001', /Alice Smith/);

    await selectByTriggerText(page, 'Front Office', 'Engineering');
    // Section was cleared; saving without one is blocked.
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByText('Section is required')).toBeVisible();

    // Only the new department's sections are offered.
    await page.getByRole('combobox').filter({ hasText: 'Select section' }).click();
    await expect(page.getByRole('option', { name: 'Reception Hotel' })).toHaveCount(0);
    await page.getByRole('option', { name: 'Engineering' }).click();

    await page.getByRole('button', { name: 'Save Changes' }).click();
    await page.getByRole('button', { name: 'Yes, save changes' }).click();
    await expect(page.getByText('Member updated successfully.')).toBeVisible();

    expect(bodies).toHaveLength(1);
    const patch = (bodies[0] as { patch: Record<string, unknown> }).patch;
    expect(patch.department).toBe('Engineering');
    expect(patch.section).toBe('Engineering');
  });

  test('edit member: inactive member shows badge and reactivates via the switch', async ({ page }) => {
    const bodies: Array<Record<string, unknown>> = [];
    await openHotelTraining(page, ADMIN_EMAIL, { onManageBody: (b) => bodies.push(b as Record<string, unknown>) });
    await openEditMemberTab(page);

    await page.getByRole('button', { name: 'Search by name or Employee ID...' }).click();
    await page.getByPlaceholder('Type name or ID...').fill('Dave');
    await expect(page.getByRole('option', { name: /Dave Black/ }).getByText('Inactive')).toBeVisible();
    await page.getByRole('option', { name: /Dave Black/ }).click();

    // No field changes → Save still disabled until the switch is on.
    await expect(page.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
    await page.getByLabel('Reactivate this member').click();
    await page.getByRole('button', { name: 'Save Changes' }).click();

    await expect(page.getByText('Will be reactivated')).toBeVisible();
    await page.getByRole('button', { name: 'Yes, save changes' }).click();
    await expect(page.getByText('Member updated successfully.')).toBeVisible();

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toEqual({
      action: 'update',
      itemId: 'col-4',
      patch: {
        colleagueName: 'Dave Black',
        position: 'Staff',
        section: 'Security',
        department: 'Security',
        reactivate: true,
      },
    });
  });
```

Also extend the existing gating test (line 118, `'Manage Members tab hidden for non-admin, visible for admin'`) — after line 125's visibility assertion, add:

```ts
    await adminPage.getByRole('tab', { name: 'Manage Members' }).click();
    await expect(adminPage.getByRole('tab', { name: 'Add New Member' })).toBeVisible();
    await expect(adminPage.getByRole('tab', { name: 'Remove Member' })).toBeVisible();
    await expect(adminPage.getByRole('tab', { name: 'Edit Member' })).toBeVisible();
```

- [ ] **Step 4: Run the new tests to verify they fail**

Run: `npx playwright test tests/hotel-training.spec.ts -g "edit member|Manage Members tab"`
Expected: the three `edit member` tests and the gating test FAIL (no `Edit Member` tab exists yet). Pre-existing tests untouched.

- [ ] **Step 5: Commit**

```bash
git add tests/helpers/hotel-training-mocks.ts tests/hotel-training.spec.ts
git commit -m "test(hotel-training): failing E2E coverage for the Edit Member tab"
```

---

### Task 4: `EditMemberForm` component + tab registration

**Files:**
- Create: `src/components/hotel-training/EditMemberForm.tsx`
- Modify: `src/components/hotel-training/AdminPanel.tsx`

**Interfaces:**
- Consumes: `invokeManageColleague` `update` arm (Task 2), `useColleagues`, `ADMIN_EMAILS`, `DEPARTMENT_SECTIONS`, `Colleague` type.
- Produces: `EditMemberForm` (no props), third tab `Edit Member` in `AdminPanel`. UI copy must match Task 3's tests exactly.

- [ ] **Step 1: Create `EditMemberForm.tsx`**

```tsx
import React, { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/hooks/useAuth';
import { useColleagues } from '@/hooks/useColleagues';
import { invokeManageColleague } from '@/services/sharepoint';
import { ADMIN_EMAILS, DEPARTMENT_SECTIONS } from '@/lib/hotel-training-constants';
import type { Colleague } from '@/types/hotel-training';

const schema = z.object({
  name: z.string().regex(/^[A-Za-z ]+$/, 'Name must contain letters only').min(1, 'Name is required'),
  position: z.string().regex(/^[A-Za-z ]+$/, 'Position must contain letters only').min(1, 'Position is required'),
  department: z.string().min(1, 'Department is required'),
  section: z.string().min(1, 'Section is required'),
});

type FormValues = z.infer<typeof schema>;

export function EditMemberForm() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: colleagues = [] } = useColleagues();
  const isAdmin = ADMIN_EMAILS.includes(user?.email?.toLowerCase() ?? '');

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Colleague | null>(null);
  const [reactivate, setReactivate] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  const {
    control,
    getValues,
    handleSubmit,
    register,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', position: '', department: '', section: '' },
  });

  // Active and inactive members are both listed; inactive ones get a badge
  // and can be reactivated.
  const matches = colleagues.filter(
    (colleague) =>
      search === '' ||
      colleague.colleagueName.toLowerCase().includes(search.toLowerCase()) ||
      colleague.employeeId.includes(search),
  );

  const selectMember = (colleague: Colleague) => {
    setSelected(colleague);
    setReactivate(false);
    reset({
      name: colleague.colleagueName,
      position: colleague.position,
      department: colleague.department,
      section: colleague.section,
    });
    setOpen(false);
    setSearch('');
  };

  const selectedDept = watch('department');
  const sections = selectedDept ? DEPARTMENT_SECTIONS[selectedDept] ?? [] : [];

  const values = watch();
  const changes = selected
    ? [
        { label: 'Name', from: selected.colleagueName, to: values.name },
        { label: 'Position', from: selected.position, to: values.position },
        { label: 'Department', from: selected.department, to: values.department },
        { label: 'Section', from: selected.section, to: values.section },
      ].filter((change) => change.from !== change.to)
    : [];
  const canSave = selected !== null && (changes.length > 0 || reactivate);

  const handleConfirmedSave = async () => {
    if (!isAdmin) {
      toast.error('Unauthorised action.');
      return;
    }
    if (!selected) return;

    const v = getValues();
    setSaving(true);
    try {
      await invokeManageColleague({
        action: 'update',
        itemId: selected.id,
        patch: {
          colleagueName: v.name,
          position: v.position,
          section: v.section,
          department: v.department,
          ...(reactivate ? { reactivate: true } : {}),
        },
      });
      await queryClient.invalidateQueries({ queryKey: ['colleagues'] });
      setSelected(null);
      setReactivate(false);
      reset({ name: '', position: '', department: '', section: '' });
      setConfirming(false);
      toast.success('Member updated successfully.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update member.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-md space-y-4">
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Search colleague</label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" className="w-full justify-start font-normal">
              {selected ? (
                `${selected.colleagueName} (${selected.employeeId})`
              ) : (
                <span className="text-muted-foreground">Search by name or Employee ID...</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput placeholder="Type name or ID..." value={search} onValueChange={setSearch} />
              <CommandList>
                <CommandEmpty>No colleague found.</CommandEmpty>
                <CommandGroup>
                  {matches.map((colleague) => (
                    <CommandItem
                      key={colleague.id}
                      value={`${colleague.colleagueName} ${colleague.employeeId}`}
                      onSelect={() => selectMember(colleague)}
                    >
                      <span className="font-medium">{colleague.colleagueName}</span>
                      <span className="ml-2 text-xs text-muted-foreground">ID: {colleague.employeeId}</span>
                      {!colleague.isActive && (
                        <Badge variant="secondary" className="ml-auto">
                          Inactive
                        </Badge>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {selected && (
        <form onSubmit={handleSubmit(() => setConfirming(true))} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-employee-id">Employee ID</Label>
            <Input id="edit-employee-id" value={selected.employeeId} disabled />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input id="edit-name" {...register('name')} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-position">
              Position <span className="text-destructive">*</span>
            </Label>
            <Input id="edit-position" {...register('position')} />
            {errors.position && <p className="text-sm text-destructive">{errors.position.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>
              Department <span className="text-destructive">*</span>
            </Label>
            <Controller
              name="department"
              control={control}
              render={({ field }) => (
                <Select
                  onValueChange={(value) => {
                    field.onChange(value);
                    setValue('section', '');
                  }}
                  value={field.value}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(DEPARTMENT_SECTIONS).map((department) => (
                      <SelectItem key={department} value={department}>
                        {department}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.department && <p className="text-sm text-destructive">{errors.department.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>
              Section <span className="text-destructive">*</span>
            </Label>
            <Controller
              name="section"
              control={control}
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value} disabled={!selectedDept}>
                  <SelectTrigger>
                    <SelectValue placeholder={selectedDept ? 'Select section' : 'Select department first'} />
                  </SelectTrigger>
                  <SelectContent>
                    {sections.map((section) => (
                      <SelectItem key={section} value={section}>
                        {section}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.section && <p className="text-sm text-destructive">{errors.section.message}</p>}
          </div>

          {!selected.isActive && (
            <div className="space-y-2 rounded-lg border border-border bg-muted/50 p-3 text-sm">
              <p>This member is inactive and cannot be selected in trainings.</p>
              <div className="flex items-center gap-2">
                <Switch id="edit-reactivate" checked={reactivate} onCheckedChange={setReactivate} />
                <Label htmlFor="edit-reactivate">Reactivate this member</Label>
              </div>
            </div>
          )}

          <Button type="submit" disabled={!canSave || saving} className="w-full">
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </form>
      )}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply changes to {selected?.colleagueName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Past training records keep their original values; only future submissions use the new details.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="space-y-1 text-sm">
            {changes.map((change) => (
              <li key={change.label}>
                {change.label}: {change.from} → {change.to}
              </li>
            ))}
            {reactivate && <li>Will be reactivated</li>}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmedSave} disabled={saving}>
              {saving ? 'Saving...' : 'Yes, save changes'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

- [ ] **Step 2: Register the tab in `AdminPanel.tsx`**

Replace the file content with:

```tsx
import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AddMemberForm } from './AddMemberForm';
import { EditMemberForm } from './EditMemberForm';
import { RemoveMemberForm } from './RemoveMemberForm';

export function AdminPanel() {
  return (
    <div className="max-w-2xl">
      <Tabs defaultValue="add">
        <TabsList>
          <TabsTrigger value="add">Add New Member</TabsTrigger>
          <TabsTrigger value="edit">Edit Member</TabsTrigger>
          <TabsTrigger value="remove">Remove Member</TabsTrigger>
        </TabsList>
        <TabsContent value="add" className="pt-4">
          <AddMemberForm />
        </TabsContent>
        <TabsContent value="edit" className="pt-4">
          <EditMemberForm />
        </TabsContent>
        <TabsContent value="remove" className="pt-4">
          <RemoveMemberForm />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 3: Run the edit-member tests to verify they pass**

Run: `npx playwright test tests/hotel-training.spec.ts -g "edit member|Manage Members tab"`
Expected: all four PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/hotel-training/EditMemberForm.tsx src/components/hotel-training/AdminPanel.tsx
git commit -m "feat(hotel-training): Edit Member tab with department cascade and reactivate"
```

---

### Task 5: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Type-check** — Run: `npx tsc -p tsconfig.app.json --noEmit` → no errors.
- [ ] **Step 2: Lint** — Run: `npm run lint` → no new errors versus main.
- [ ] **Step 3: Full E2E suite** — Run: `npx playwright test tests/hotel-training.spec.ts` → all tests pass (pre-existing + 4 new/extended).
- [ ] **Step 4: Production build** — Run: `npm run build` → succeeds.
- [ ] **Step 5: Commit any stragglers; otherwise nothing to commit.**

---

### Task 6: Deploy

**Files:** none (deployment)

- [ ] **Step 1: Deploy the Edge Function** via Supabase MCP `deploy_edge_function` for `sp-manage-colleague` (project ref `yczcebfaqerlwfalrbjn`), sending the updated `index.ts`. The change is backward-compatible (adds one action; `add`/`deactivate` untouched).
- [ ] **Step 2: Rebuild the frontend** — `npm run build` publishes the new UI from `dist/` (already built in Task 5; re-run only if further commits landed).
- [ ] **Step 3: Smoke check** — user verifies in the live UI with a real case (e.g. an actual promotion), confirming the confirmation dialog and the updated values in the member list.
