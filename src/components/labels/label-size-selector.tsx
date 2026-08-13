import { LABEL_SIZES, type LabelSizeKey } from "@/lib/label-sizes"

interface LabelSizeSelectorProps {
  value: LabelSizeKey
  onChange: (value: LabelSizeKey) => void
}

export function LabelSizeSelector({ value, onChange }: LabelSizeSelectorProps) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">Tamaño de etiqueta</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Object.entries(LABEL_SIZES).map(([key, size]) => (
          <label key={key} className="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm hover:bg-muted/50">
            <input
              type="radio"
              name="label-size"
              value={key}
              checked={value === key}
              onChange={() => onChange(key as LabelSizeKey)}
            />
            <span>{size.width}x{size.height}mm</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
