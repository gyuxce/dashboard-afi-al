import React from 'react';

type Props = {
  colSpan: number;
  paddingTop: number;
  paddingBottom: number;
  children: React.ReactNode;
  className?: string;
};

/** Spacer rows keep scroll height correct while only visible <tr>s mount. */
export function VirtualizedTbody({
  colSpan,
  paddingTop,
  paddingBottom,
  children,
  className,
}: Props) {
  return (
    <tbody className={className}>
      {paddingTop > 0 ? (
        <tr aria-hidden="true" style={{ height: paddingTop }}>
          <td
            colSpan={colSpan}
            style={{
              height: paddingTop,
              padding: 0,
              border: 'none',
              lineHeight: 0,
            }}
          />
        </tr>
      ) : null}
      {children}
      {paddingBottom > 0 ? (
        <tr aria-hidden="true" style={{ height: paddingBottom }}>
          <td
            colSpan={colSpan}
            style={{
              height: paddingBottom,
              padding: 0,
              border: 'none',
              lineHeight: 0,
            }}
          />
        </tr>
      ) : null}
    </tbody>
  );
}
