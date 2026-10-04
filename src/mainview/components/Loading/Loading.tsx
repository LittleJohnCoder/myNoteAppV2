import type React from "react";

import { cx } from "@/utils/cx";

export interface LoadingProps {
  isLoading: boolean;
  readonly className?: string;
  readonly children?: React.ReactNode;
}

/**
 * The shared load-or-render primitive (CODE_STYLE §5.7): one place decides what "still loading"
 * looks like, instead of `isLoading ? <Something /> : children` repeated at every call site.
 */
export const Loading: React.FC<LoadingProps> = ({ isLoading, className, children }) => {
  if (isLoading) {
    return <p className={cx("load__skeleton", className)} aria-busy="true" role="status" />;
  }
  return <>{children}</>;
};
