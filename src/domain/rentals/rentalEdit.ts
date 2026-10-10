import { z } from "zod";
import { rentalItemSchema } from "@/domain/rentals/rental";

export const rentalEditSchema = z.object({
  items: z.array(rentalItemSchema).min(1, "Selecciona al menos un producto."),
  initial_rent_amount: z
    .number()
    .gt(0, "La renta inicial debe ser mayor a 0."),
  deposit_amount: z.number().min(0, "El depósito no puede ser negativo."),
});

export type RentalEditValues = z.infer<typeof rentalEditSchema>;

export const paymentEditSchema = z.object({
  amount: z.number().gt(0, "El monto debe ser mayor a 0."),
  note: z.string().trim().optional(),
});

export type PaymentEditValues = z.infer<typeof paymentEditSchema>;
