import React from "react";

// 原创像素小图标：字符画 → SVG 方块，crispEdges 保证边缘是方的
export type SpriteDef = { rows: string[]; colors: Record<string, string> };

export const Sprite: React.FC<{ def: SpriteDef; px: number; style?: React.CSSProperties }> = ({
  def,
  px,
  style,
}) => {
  const h = def.rows.length;
  const w = Math.max(...def.rows.map((r) => r.length));
  const rects: React.ReactNode[] = [];
  def.rows.forEach((row, y) =>
    [...row].forEach((c, x) => {
      const fill = def.colors[c];
      if (fill) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />);
    }),
  );
  return (
    <svg
      width={w * px}
      height={h * px}
      viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
      style={{ display: "block", ...style }}
    >
      {rects}
    </svg>
  );
};

export const HEART: SpriteDef = {
  rows: [
    ".KK...KK.",
    "KRRK.KRRK",
    "KRWRKRRRK",
    "KRRRRRRRK",
    ".KRRRRRK.",
    "..KRRRK..",
    "...KRK...",
    "....K....",
  ],
  colors: { K: "#2b2b3a", R: "#c8423b", W: "#fffaf0" },
};

export const COIN: SpriteDef = {
  rows: [
    "...KKKKKK...",
    "..KYYYYYYK..",
    ".KYYWWYYYOK.",
    "KYYWYYKYYYOK",
    "KYYWYYKYYYOK",
    "KYYYYYKYYYOK",
    "KYYYYYKYYYOK",
    "KYYYYYKYYYOK",
    "KYYYYYYYYYOK",
    ".KOYYYYYYOK.",
    "..KOOOOOOK..",
    "...KKKKKK...",
  ],
  colors: { K: "#2b2b3a", Y: "#f2c14e", O: "#e07a3f", W: "#fffaf0" },
};

export const BLOB: SpriteDef = {
  rows: [
    ".....KK.....",
    "....KGGK....",
    ".....KK.....",
    "...KKKKKK...",
    "..KGGGGGGK..",
    ".KGGWKGWKGK.",
    ".KGGWKGWKGK.",
    ".KGGGGGGGGK.",
    ".KGGKKKKGGK.",
    "..KGGGGGGK..",
    ".KGK.KK.KGK.",
    ".KK......KK.",
  ],
  colors: { K: "#2b2b3a", G: "#5fa55a", W: "#fffaf0" },
};

export const STAR: SpriteDef = {
  rows: [
    ".....K.....",
    "....KYK....",
    "....KYK....",
    "KKKKYYYKKKK",
    "KYYYYWYYYYK",
    ".KYYWYYYYK.",
    "..KYYYYYK..",
    "..KYYKYYK..",
    ".KYYK.KYYK.",
    ".KYK...KYK.",
    "KKK.....KKK",
  ],
  colors: { K: "#2b2b3a", Y: "#f2c14e", W: "#fffaf0" },
};

export const PAD: SpriteDef = {
  rows: [
    "..KKKKKKKKKKKKKKKKKK..",
    ".KSSSSSSSSSSSSSSSSSSK.",
    "KSSSKKSSSSSSSSSSSSSSSK",
    "KSSSKIKSSSSSSSSSSRRSSK",
    "KSKKKIKKKSSSSSSSSRRSSK",
    "KSKIIIIIKSSKKSKKSSSSSK",
    "KSKKKIKKKSSSSSSSSSRRSK",
    "KSSSKIKSSSSSSSSSSSRRSK",
    "KSSSKKSSSSSSSSSSSSSSSK",
    ".KSSSSSSKKKKKKKSSSSSK.",
    "..KKKKKK.......KKKKK..",
  ],
  colors: { K: "#2b2b3a", S: "#8b8b9a", I: "#2b2b3a", R: "#c8423b" },
};

export const BOOK: SpriteDef = {
  rows: [
    ".KKKKKK..KKKKKK.",
    "KWWWWWWKKWWWWWWK",
    "KWLLLLWKKWLLLLWK",
    "KWWWWWWKKWWWWWWK",
    "KWLLLWWKKWLLLLWK",
    "KWWWWWWKKWWWWWWK",
    "KWLLLLWKKWLLLWWK",
    "KWWWWWWKKWWWWWWK",
    "KOOOOOOKKOOOOOOK",
    ".KKKKKKKKKKKKKK.",
  ],
  colors: { K: "#2b2b3a", W: "#fffaf0", L: "#a8502a", O: "#e07a3f" },
};
