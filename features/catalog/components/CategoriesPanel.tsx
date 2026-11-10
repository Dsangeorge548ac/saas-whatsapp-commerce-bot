"use client";
/**
 * Pestaña "Categories": lista, alta, renombrar y borrar categorías.
 * Borrar una categoría NO borra sus productos (quedan sin categoría). Solo el dueño puede editar;
 * los operadores solo ven la lista.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmAction } from "@/components/feedback/sweet-confirm";
import { notify } from "@/components/feedback/notify";
import { createCategory, deleteCategory, renameCategory } from "@/features/catalog/actions/categories";

type Props = { categories: { id: string; name: string }[]; canEdit: boolean };

export function CategoriesPanel({ categories, canEdit }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(task: () => Promise<{ ok: boolean; error?: string }>, onDone: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await task();
      if (!result.ok) return setError(result.error ?? "Something went wrong.");
      onDone();
      router.refresh();
    });
  }

  async function remove(id: string, label: string) {
    const answer = await confirmAction({ title: `Delete "${label}"?`, text: "Its products stay in your catalog without a category.", confirmLabel: "Delete category", tone: "danger" });
    if (answer.confirmed) run(() => deleteCategory(id), () => notify.success("Category deleted"));
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      {canEdit ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            run(() => createCategory({ name }), () => setName(""));
          }}
          className="flex items-center gap-2"
        >
          <label className="flex-1">
            <span className="sr-only">New category name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="New category, e.g. Breads" className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-black" />
          </label>
          <Button type="submit" disabled={isPending || name.trim() === ""}><Plus aria-hidden /> Add</Button>
        </form>
      ) : null}
      {error ? <p role="alert" className="text-sm text-danger-strong">{error}</p> : null}

      {categories.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
          <p className="text-sm font-medium text-fg">No categories yet</p>
          <p className="mt-1 text-sm text-fg-muted">Categories group your products (for example Breads, Drinks or Tools). They&apos;re optional.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {categories.map((category) => (
            <li key={category.id} className="flex items-center gap-2 px-4 py-2.5">
              {editingId === category.id ? (
                <>
                  <input value={editingName} onChange={(event) => setEditingName(event.target.value)} maxLength={80} aria-label="Category name" className="h-9 flex-1 rounded-lg border border-border px-3 text-sm outline-none focus:border-black" autoFocus />
                  <Button variant="ghost" size="icon-sm" aria-label="Save name" disabled={isPending || editingName.trim() === ""} onClick={() => run(() => renameCategory(category.id, { name: editingName }), () => setEditingId(null))}>
                    <Check aria-hidden />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Cancel" onClick={() => setEditingId(null)}>
                    <X aria-hidden />
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 truncate text-sm text-fg">{category.name}</span>
                  {canEdit ? (
                    <>
                      <Button variant="ghost" size="icon-sm" aria-label={`Rename ${category.name}`} onClick={() => { setEditingId(category.id); setEditingName(category.name); }}>
                        <Pencil aria-hidden />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={`Delete ${category.name}`} disabled={isPending} onClick={() => remove(category.id, category.name)}>
                        <Trash2 aria-hidden />
                      </Button>
                    </>
                  ) : null}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
