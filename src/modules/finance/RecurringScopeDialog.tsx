import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type RecurringScope = "only_this" | "this_and_next" | "all";

interface Props {
  open: boolean;
  action: "edit" | "delete";
  onConfirm: (scope: RecurringScope) => void;
  onCancel: () => void;
}

export function RecurringScopeDialog({ open, action, onConfirm, onCancel }: Props) {
  const isDelete = action === "delete";
  const title = isDelete ? "Excluir lançamento recorrente" : "Editar lançamento recorrente";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Este lançamento faz parte de uma série recorrente. Qual o escopo da alteração?
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Button variant="outline" className="justify-start" onClick={() => onConfirm("only_this")}>
            Apenas este
          </Button>
          <Button variant="outline" className="justify-start" onClick={() => onConfirm("this_and_next")}>
            Este e os próximos
          </Button>
          <Button
            variant="outline"
            className={cn("justify-start", isDelete && "text-rose-600 hover:text-rose-700")}
            onClick={() => onConfirm("all")}
          >
            Todos da série
          </Button>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
