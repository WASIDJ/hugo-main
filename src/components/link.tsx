import NextLink from "next/link";
import type { ComponentProps } from "react";
// Avoid eagerly downloading entire long articles while reading another pane.
export default function Link(props: ComponentProps<typeof NextLink>) {
  return <NextLink {...props} prefetch={props.prefetch ?? false} />;
}
