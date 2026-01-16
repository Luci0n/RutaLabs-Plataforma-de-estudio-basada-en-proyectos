import { createProjectAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nuevo proyecto</CardTitle>
        <CardDescription>
          Crea un contenedor de estudio con bloques (texto y flashcards).
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {sp.error ? <p className="text-sm text-destructive">{sp.error}</p> : null}

        <form action={createProjectAction} className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm">Título</label>
            <Input name="title" required />
          </div>

          <div className="space-y-1">
            <label className="text-sm">Descripción (markdown simple)</label>
            <textarea
              name="description_md"
              className="min-h-28 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="Objetivo, recursos, temas..."
            />
          </div>

          <Button className="w-full" type="submit">
            Crear
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
