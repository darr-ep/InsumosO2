import { useState } from "react";
import { ArrowLeft, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/ui/currency-input";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { LoadingDialog } from "@/components/LoadingDialog";
import {
  ItemQuantityPicker,
  itemQuantitiesToList,
  type ItemQuantities,
} from "@/components/ItemQuantityPicker";
import type { RentalItemType } from "@/domain/rentals/rental";
import { rentalEditSchema } from "@/domain/rentals/rentalEdit";

export interface RentalEditFormProps {
  initialValues: {
    initialRentAmount: number;
    depositAmount: number;
    items: { itemType: RentalItemType; quantity: number }[];
  };
  folio: string;
  onSubmit: (values: {
    initialRentAmount: number;
    depositAmount: number;
    items: { itemType: RentalItemType; quantity: number }[];
  }) => void | Promise<void>;
  onCancel: () => void;
  onDelete: () => void;
  isSubmitting?: boolean;
}

export function RentalEditForm({
  initialValues,
  folio,
  onSubmit,
  onCancel,
  onDelete,
  isSubmitting = false,
}: RentalEditFormProps) {
  const initialQuantities: ItemQuantities = {
    concentrator:
      initialValues.items.find((i) => i.itemType === "concentrator")?.quantity ?? 0,
    tank:
      initialValues.items.find((i) => i.itemType === "tank")?.quantity ?? 0,
  };

  const [itemQuantities, setItemQuantities] =
    useState<ItemQuantities>(initialQuantities);
  const [rentAmount, setRentAmount] = useState(
    String(initialValues.initialRentAmount || ""),
  );
  const [depositAmount, setDepositAmount] = useState(
    String(initialValues.depositAmount || 0),
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  const isDirty =
    itemQuantities.concentrator !== initialQuantities.concentrator ||
    itemQuantities.tank !== initialQuantities.tank ||
    Number(rentAmount) !== initialValues.initialRentAmount ||
    Number(depositAmount) !== initialValues.depositAmount;

  function handleCancelClick() {
    if (isDirty) {
      setConfirmDiscardOpen(true);
      return;
    }
    onCancel();
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const itemsList = itemQuantitiesToList(itemQuantities);
    const parsed = rentalEditSchema.safeParse({
      items: itemsList.map((item) => ({
        item_type: item.itemType,
        quantity: item.quantity,
      })),
      initial_rent_amount: Number(rentAmount || 0),
      deposit_amount: Number(depositAmount || 0),
    });

    if (!parsed.success) {
      setFormError(
        parsed.error.issues[0]?.message ?? "Revisa los datos de la renta.",
      );
      return;
    }

    void onSubmit({
      initialRentAmount: parsed.data.initial_rent_amount,
      depositAmount: parsed.data.deposit_amount,
      items: itemsList,
    });
  }

  return (
    <>
      <div className="sticky -top-1 -mx-4 -mt-1 z-20 flex items-center justify-between bg-background px-4 pt-1.5 pb-2.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleCancelClick}
          className="-ml-2 flex items-center gap-1.5 text-lg font-bold text-foreground hover:bg-transparent"
        >
          <ArrowLeft aria-hidden="true" className="size-5" />
          Editar renta {folio}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 text-destructive hover:text-destructive/70 transition-colors"
          aria-label={`Eliminar renta ${folio}`}
          onClick={onDelete}
        >
          <Trash2 aria-hidden="true" className="size-4" />
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-2">
          <Label required>Productos rentados</Label>
          <ItemQuantityPicker
            value={itemQuantities}
            onChange={setItemQuantities}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rental-edit-rent-amount" required>
            Renta inicial
          </Label>
          <CurrencyInput
            id="rental-edit-rent-amount"
            placeholder="$ 0"
            value={rentAmount}
            onChange={setRentAmount}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rental-edit-deposit-amount">
            Depósito inicial
          </Label>
          <CurrencyInput
            id="rental-edit-deposit-amount"
            placeholder="$ 0"
            value={depositAmount}
            onChange={setDepositAmount}
          />
        </div>

        {formError && (
          <p className="text-destructive text-sm">{formError}</p>
        )}

        <div className="sticky -bottom-4 -mx-4 -mb-4 z-20 mt-auto flex gap-2 border-t bg-background px-4 pt-3 pb-6">
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={isSubmitting}
            onClick={handleCancelClick}
            className="flex-1 bg-card hover:bg-muted border border-border shadow-xs"
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            size="lg"
            disabled={isSubmitting}
            className="flex-1"
          >
            Guardar
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={confirmDiscardOpen}
        onOpenChange={setConfirmDiscardOpen}
        title="¿Descartar los cambios?"
        description="Se perderán los cambios que hiciste a los productos o montos de la renta."
        cancelLabel="Seguir editando"
        confirmLabel="Sí, descartar"
        onConfirm={() => {
          setConfirmDiscardOpen(false);
          onCancel();
        }}
      />

      <LoadingDialog
        open={isSubmitting}
        title="Guardando cambios..."
        description="Estamos actualizando la información de la renta."
      />
    </>
  );
}
