"use client";
/**
 * Editor del menú principal del bot: el texto que acompaña al menú, la etiqueta del botón de la lista y las
 * opciones (1 a 10). Cada opción tiene nombre, descripción corta y qué hace (pedir del catálogo, mostrar una
 * categoría o un producto, información del negocio o hablar con un asesor). Se pueden reordenar, quitar y agregar.
 * A la derecha, una vista previa de cómo lo verá el cliente en WhatsApp (botones si son 3 o menos; lista si son más).
 * Se valida aquí (Zod, límites de WhatsApp) y otra vez en el servidor y en la base. Guardar se confirma antes.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, List, Plus, Trash2 } from "lucide-react";
import { notify } from "@/components/feedback/notify";
import { confirmAction } from "@/components/feedback/sweet-confirm";
import { Field, SelectInput, TextInput } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { saveMenu } from "@/features/settings/actions/menu";
import { MAX_MENU_ITEMS, MENU_ACTIONS, menuDisplay, menuSchema, type MenuItemInput } from "@/features/settings/menu";

type Option = { id: string; name: string };
type Props = { initial: { body: string; buttonLabel: string; items: MenuItemInput[] }; categories: Option[]; products: Option[]; /** Aún no hay menú guardado: se puede guardar el sugerido sin cambiarlo. */ isNew?: boolean };

const emptyItem = (): MenuItemInput => ({ title: "", description: "", action: "start_order", categoryId: "", productId: "" });

export function MenuEditor({ initial, categories, products, isNew = false }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [body, setBody] = useState(initial.body);
  const [buttonLabel, setButtonLabel] = useState(initial.buttonLabel);
  const [items, setItems] = useState<MenuItemInput[]>(initial.items.length ? initial.items : [emptyItem()]);
  const [showErrors, setShowErrors] = useState(false);

  const parsed = menuSchema.safeParse({ body, buttonLabel, items });
  const issues = parsed.success ? [] : parsed.error.issues;
  const errorFor = (path: (string | number)[]) => (showErrors ? issues.find((issue) => path.every((part, i) => issue.path[i] === part))?.message : undefined);
  const dirty = isNew || JSON.stringify({ body, buttonLabel, items }) !== JSON.stringify(initial);

  const update = (index: number, change: Partial<MenuItemInput>) => setItems((current) => current.map((item, i) => (i === index ? { ...item, ...change } : item)));
  const move = (index: number, delta: number) =>
    setItems((current) => {
      const next = [...current];
      const [moved] = next.splice(index, 1);
      next.splice(index + delta, 0, moved!);
      return next;
    });

  async function save() {
    setShowErrors(true);
    if (!parsed.success) return notify.error(issues[0]?.message ?? "Check the menu.");
    const answer = await confirmAction({ title: "Save the menu?", text: "Customers see the new menu the next time they write to your WhatsApp.", confirmLabel: "Save menu" });
    if (!answer.confirmed) return;
    start(async () => {
      const result = await saveMenu({ body, buttonLabel, items });
      if (!result.ok) return notify.error(result.error);
      notify.success(result.message ?? "Saved");
      router.refresh();
    });
  }

  const display = menuDisplay(items.length);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-5 rounded-lg border border-border bg-surface p-5">
          <h2 className="text-base font-semibold text-fg">Menu text</h2>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="menu-body" className="text-xs font-medium text-fg">Message shown with the options</label>
            <Textarea id="menu-body" value={body} onChange={(event) => setBody(event.target.value)} rows={3} maxLength={1024} aria-invalid={Boolean(errorFor(["body"]))} />
            {errorFor(["body"]) ? <p className="text-xs text-danger-strong">{errorFor(["body"])}</p> : <p className="text-xs text-fg-muted">{body.length} / 1024</p>}
          </div>
          <Field label="List button text" error={errorFor(["buttonLabel"])} hint="Shown when the menu has 4 or more options (WhatsApp list). Max 20 characters.">
            {(props) => <TextInput {...props} value={buttonLabel} onChange={(event) => setButtonLabel(event.target.value)} maxLength={20} />}
          </Field>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-fg">Options</h2>
              <p className="text-sm text-fg-muted">{items.length} of {MAX_MENU_ITEMS}. Up to 3 show as buttons; 4 or more show as a list.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setItems((current) => [...current, emptyItem()])} disabled={items.length >= MAX_MENU_ITEMS}>
              <Plus aria-hidden /> Add option
            </Button>
          </div>

          <ol className="flex flex-col gap-3">
            {items.map((item, index) => (
              <li key={index} className="rounded-lg border border-border bg-surface p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="grid size-6 place-items-center rounded-full bg-black text-[11px] font-semibold text-white">{index + 1}</span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon-sm" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move option ${index + 1} up`}><ArrowUp aria-hidden /></Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => move(index, 1)} disabled={index === items.length - 1} aria-label={`Move option ${index + 1} down`}><ArrowDown aria-hidden /></Button>
                    <Button variant="danger-ghost" size="icon-sm" onClick={() => setItems((current) => current.filter((_, i) => i !== index))} disabled={items.length === 1} aria-label={`Remove option ${index + 1}`}><Trash2 aria-hidden /></Button>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Option name" error={errorFor(["items", index, "title"])} hint={`${item.title.length} / 24`}>
                    {(props) => <TextInput {...props} value={item.title} onChange={(event) => update(index, { title: event.target.value })} maxLength={24} placeholder="e.g. Order now" />}
                  </Field>
                  <Field label="Short description (optional)" error={errorFor(["items", index, "description"])} hint="Shown only in the list.">
                    {(props) => <TextInput {...props} value={item.description} onChange={(event) => update(index, { description: event.target.value })} maxLength={72} placeholder="e.g. See products and prices" />}
                  </Field>
                  <Field label="What it does" hint={MENU_ACTIONS.find((action) => action.value === item.action)?.hint}>
                    {(props) => (
                      <SelectInput {...props} value={item.action} onChange={(event) => update(index, { action: event.target.value as MenuItemInput["action"] })}>
                        {MENU_ACTIONS.map((action) => <option key={action.value} value={action.value}>{action.label}</option>)}
                      </SelectInput>
                    )}
                  </Field>
                  {item.action === "show_category" ? (
                    <Field label="Category" error={errorFor(["items", index, "categoryId"])} hint={categories.length ? undefined : "Create a category in Catalog first."}>
                      {(props) => (
                        <SelectInput {...props} value={item.categoryId} onChange={(event) => update(index, { categoryId: event.target.value })}>
                          <option value="">Choose a category</option>
                          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                        </SelectInput>
                      )}
                    </Field>
                  ) : null}
                  {item.action === "show_product" ? (
                    <Field label="Product" error={errorFor(["items", index, "productId"])} hint={products.length ? undefined : "Add a product in Catalog first."}>
                      {(props) => (
                        <SelectInput {...props} value={item.productId} onChange={(event) => update(index, { productId: event.target.value })}>
                          <option value="">Choose a product</option>
                          {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                        </SelectInput>
                      )}
                    </Field>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
          {errorFor(["items"]) ? <p className="text-xs text-danger-strong">{errorFor(["items"])}</p> : null}
        </section>

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
          <Button onClick={save} disabled={pending || !dirty}>{pending ? "Saving…" : "Save menu"}</Button>
          {dirty && !isNew ? (
            <Button variant="ghost" disabled={pending} onClick={() => { setBody(initial.body); setButtonLabel(initial.buttonLabel); setItems(initial.items.length ? initial.items : [emptyItem()]); setShowErrors(false); }}>
              Discard changes
            </Button>
          ) : <span className="text-xs text-fg-muted">{isNew ? "Save it to start using this menu." : "No unsaved changes."}</span>}
        </div>
      </div>

      {/* Vista previa tipo WhatsApp (solo ilustrativa). */}
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <p className="mb-2 text-xs font-medium text-fg-muted">Preview on WhatsApp</p>
        <div className="rounded-lg bg-[#e7f3dd] p-3">
          <div className="max-w-[85%] overflow-hidden rounded-lg bg-white text-sm text-fg shadow-sm">
            <p className="whitespace-pre-wrap px-3 py-2">{body || "—"}</p>
            {display === "buttons" ? (
              <div className="divide-y divide-border border-t border-border">
                {items.map((item, index) => <p key={index} className="px-3 py-2 text-center text-[13px] font-medium text-[#0a7cff]">{item.title || `Option ${index + 1}`}</p>)}
              </div>
            ) : (
              <p className="flex items-center justify-center gap-1.5 border-t border-border px-3 py-2 text-[13px] font-medium text-[#0a7cff]"><List className="size-3.5" aria-hidden /> {buttonLabel || "Options"}</p>
            )}
          </div>
          {display === "list" ? (
            <ul className="mt-3 divide-y divide-border rounded-lg bg-white text-sm shadow-sm">
              {items.map((item, index) => (
                <li key={index} className="px-3 py-2">
                  <p className="font-medium text-fg">{item.title || `Option ${index + 1}`}</p>
                  {item.description ? <p className="text-xs text-fg-muted">{item.description}</p> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <p className="mt-2 text-[11px] text-fg-muted">{display === "buttons" ? "3 or fewer options: customers tap a button." : "4 or more: customers open the list with the button."}</p>
      </aside>
    </div>
  );
}
