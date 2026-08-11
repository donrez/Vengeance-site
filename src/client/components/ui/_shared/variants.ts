export type Variant = "solid" | "outline" | "ghost" | "link" | "soft";
export type Color = "neutral" | "primary" | "destructive";

export const DEFAULT_VARIANT: Variant = "solid";
export const DEFAULT_COLOR: Color = "neutral";

/**
 * Base classes shared by Button and IconButton.
 * Ring width/offset live here; ring *color* lives per variant×color cell below
 * so tailwind-merge resolves to a single ring color.
 */
export const CONTROL_BASE =
  "inline-flex items-center justify-center whitespace-nowrap font-medium cursor-pointer " +
  "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 " +
  "disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed " +
  "[&_svg]:pointer-events-none [&_svg]:shrink-0";

/**
 * variant (style treatment) × color (intent) → Tailwind classes.
 * `solid` + `neutral` is the default black button.
 * Uses the default Tailwind palette — edit freely per project.
 */
export const VARIANT_COLOR: Record<Variant, Record<Color, string>> = {
  solid: {
    neutral:
      "bg-frost text-void shadow hover:bg-white active:bg-mist focus-visible:ring-mist focus-visible:ring-offset-void",
    primary:
      "bg-blood text-white shadow-[0_0_24px_rgba(230,46,77,0.35)] hover:bg-blood-bright active:bg-blood-deep focus-visible:ring-blood focus-visible:ring-offset-void",
    destructive:
      "bg-red-600 text-white shadow-sm hover:bg-red-500 active:bg-red-700 focus-visible:ring-red-500 focus-visible:ring-offset-void",
  },
  outline: {
    neutral:
      "border border-edge bg-transparent text-frost hover:bg-surface hover:border-edge-bright active:bg-surface-2 focus-visible:ring-mist focus-visible:ring-offset-void",
    primary:
      "border border-blood/50 bg-transparent text-blood-bright hover:bg-blood-soft hover:border-blood active:bg-blood-soft focus-visible:ring-blood focus-visible:ring-offset-void",
    destructive:
      "border border-red-500/50 bg-transparent text-red-400 hover:bg-red-950 active:bg-red-900 focus-visible:ring-red-500 focus-visible:ring-offset-void",
  },
  ghost: {
    neutral:
      "text-frost hover:bg-surface active:bg-surface-2 focus-visible:ring-mist focus-visible:ring-offset-void",
    primary:
      "text-blood-bright hover:bg-blood-soft active:bg-blood-soft focus-visible:ring-blood focus-visible:ring-offset-void",
    destructive:
      "text-red-400 hover:bg-red-950 active:bg-red-900 focus-visible:ring-red-500 focus-visible:ring-offset-void",
  },
  link: {
    neutral:
      "text-frost underline-offset-4 hover:underline focus-visible:ring-mist focus-visible:ring-offset-void",
    primary:
      "text-blood-bright underline-offset-4 hover:underline focus-visible:ring-blood focus-visible:ring-offset-void",
    destructive:
      "text-red-400 underline-offset-4 hover:underline focus-visible:ring-red-500 focus-visible:ring-offset-void",
  },
  soft: {
    neutral:
      "bg-surface-2 text-frost shadow-sm hover:bg-edge active:bg-edge-bright focus-visible:ring-mist focus-visible:ring-offset-void",
    primary:
      "bg-blood-soft text-blood-bright shadow-sm hover:bg-blood/20 active:bg-blood/30 focus-visible:ring-blood focus-visible:ring-offset-void",
    destructive:
      "bg-red-950 text-red-300 shadow-sm hover:bg-red-900 active:bg-red-800 focus-visible:ring-red-500 focus-visible:ring-offset-void",
  },
};

export function variantColorClasses(variant: Variant, color: Color): string {
  return VARIANT_COLOR[variant][color];
}
