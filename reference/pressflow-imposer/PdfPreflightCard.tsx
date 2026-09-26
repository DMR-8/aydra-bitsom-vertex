import {
  Badge,
  Box,
  Card,
  Group,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { AlertTriangle, CircleCheck, CircleX } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { Unit } from "./types";
import {
  hairline,
  ink,
  panelCard,
  panelCardStyle,
  panelTitle,
  radii,
  tileBg,
} from "./uiTokens";
import type { ColorMode, PageBox, PdfInspection } from "./pdfInspector";

const POINTS_PER_INCH = 72;
const MM_PER_INCH = 25.4;

function formatBytes(size: number) {
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

function formatBox(box: PageBox, unit: Unit) {
  const toUnit = (points: number) =>
    unit === "in"
      ? points / POINTS_PER_INCH
      : (points / POINTS_PER_INCH) * MM_PER_INCH;
  const digits = unit === "in" ? 2 : 1;
  const trim = (value: number) => Number(value.toFixed(digits)).toString();
  return `${trim(toUnit(box.width))} × ${trim(toUnit(box.height))} ${unit}`;
}

const colorTone: Record<ColorMode, { color: string; hint: string }> = {
  CMYK: { color: "green", hint: "Press-ready separations." },
  Grayscale: { color: "green", hint: "Single-channel; prints on black only." },
  RGB: { color: "orange", hint: "Convert to CMYK before plating." },
  Mixed: { color: "orange", hint: "Some elements will convert at the RIP." },
  Unknown: { color: "gray", hint: "Nothing decisive was found in the file." },
};

type CheckStatus = "pass" | "warn" | "fail";

interface PreflightCheck {
  id: string;
  status: CheckStatus;
  title: string;
  detail: string;
}

const checkTone: Record<
  CheckStatus,
  { color: string; bg: string; border: string; Icon: typeof CircleCheck }
> = {
  pass: {
    color: "#166534",
    bg: "#f0fdf4",
    border: "#bbf7d0",
    Icon: CircleCheck,
  },
  warn: {
    color: "#92400e",
    bg: "#fffbeb",
    border: "#fde68a",
    Icon: AlertTriangle,
  },
  fail: { color: "#991b1b", bg: "#fef2f2", border: "#fecaca", Icon: CircleX },
};

/**
 * Checks that hold whatever imposition follows. Rules that depend on the
 * method — a booklet's multiple-of-four page count, say — are judged on the
 * method cards once one is being chosen.
 */
function runChecks(inspection: PdfInspection): PreflightCheck[] {
  const size: PreflightCheck = inspection.uniformPageSize
    ? {
        id: "size",
        status: "pass",
        title: "All pages are the same size",
        detail: "Spreads will pair cleanly.",
      }
    : {
        id: "size",
        status: "warn",
        title: "Pages vary in size",
        detail: "Spreads pair pages of different sizes; check the source.",
      };

  const colour: PreflightCheck =
    inspection.color.mode === "CMYK" || inspection.color.mode === "Grayscale"
      ? {
          id: "colour",
          status: "pass",
          title: `Colour is ${inspection.color.mode}`,
          detail: "Press-ready as supplied.",
        }
      : inspection.color.mode === "Unknown"
        ? {
            id: "colour",
            status: "warn",
            title: "Colour mode could not be determined",
            detail: inspection.color.basis,
          }
        : {
            id: "colour",
            status: "warn",
            title: `Colour is ${inspection.color.mode}`,
            detail:
              "Colors might shift while printing. Please Check your Machine/RIP System supports it.",
          };

  return [size, colour];
}

function CheckRow({ check }: { check: PreflightCheck }) {
  const tone = checkTone[check.status];
  return (
    <Group
      gap={10}
      wrap="nowrap"
      align="flex-start"
      style={{
        borderRadius: radii.tile,
        border: `1px solid ${tone.border}`,
        background: tone.bg,
        padding: "10px 12px",
      }}
    >
      <tone.Icon
        size={17}
        color={tone.color}
        style={{ flex: "0 0 auto", marginTop: 1 }}
      />
      <Box className="min-w-0">
        <Text size="sm" fw={800} c={tone.color}>
          {check.title}
        </Text>
        <Text size="xs" c={ink.body} mt={2}>
          {check.detail}
        </Text>
      </Box>
    </Group>
  );
}

function Tile({
  label,
  value,
  sub,
  action,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Box
      style={{
        position: "relative",
        borderRadius: radii.control,
        background: tileBg,
        border: `1px solid ${hairline}`,
        padding: 14,
        minWidth: 0,
      }}
    >
      {/* The action floats over the label row so it cannot make that row taller
          than its neighbours' and push this tile's value below theirs. */}
      {action && (
        <Box style={{ position: "absolute", top: 9, right: 10 }}>{action}</Box>
      )}
      <Text
        size="xs"
        c={ink.faint}
        fw={700}
        tt="uppercase"
        lts={0.6}
        mb={6}
        pr={action ? 80 : 0}
      >
        {label}
      </Text>
      <Text
        fw={800}
        c={ink.strong}
        style={{ fontSize: 16, lineHeight: 1.3, wordBreak: "break-word" }}
      >
        {value}
      </Text>
      {sub && (
        <Text size="xs" c={ink.muted} mt={4}>
          {sub}
        </Text>
      )}
    </Box>
  );
}

export function PdfPreflightCard({
  inspection,
}: {
  inspection: PdfInspection;
}) {
  const [unit, setUnit] = useState<Unit>("in");
  const tone = colorTone[inspection.color.mode];
  const isPdfX = /^PDF\/X/i.test(inspection.standard.label);
  const checks = runChecks(inspection);
  const worst: CheckStatus = checks.some((check) => check.status === "fail")
    ? "fail"
    : checks.some((check) => check.status === "warn")
      ? "warn"
      : "pass";

  const unitToggle = (
    <SegmentedControl
      size="xs"
      color="brand"
      value={unit}
      onChange={(value) => setUnit(value as Unit)}
      data={[
        { value: "in", label: "in" },
        { value: "mm", label: "mm" },
      ]}
    />
  );

  return (
    <Card p={22} radius={panelCard.radius} withBorder style={panelCardStyle}>
      <Group
        justify="space-between"
        align="flex-start"
        mb={18}
        wrap="wrap"
        gap="md"
      >
        <Group gap={12} wrap="nowrap" align="center">
          <Box
            style={{
              width: 40,
              height: 40,
              borderRadius: radii.tile,
              background: "rgba(239, 68, 68, 0.1)",
              display: "grid",
              placeItems: "center",
              color: "#dc2626",
              fontWeight: 900,
              fontSize: 11,
              flex: "0 0 auto",
            }}
          >
            PDF
          </Box>
          <Box className="min-w-0">
            <Title
              order={3}
              c={ink.strong}
              fw={panelTitle.fw}
              style={{ fontSize: panelTitle.fontSize }}
              lineClamp={1}
            >
              {inspection.fileName}
            </Title>
            <Text size="xs" c={ink.faint} mt={2}>
              {formatBytes(inspection.fileSize)} · {inspection.pageCount} page
              {inspection.pageCount === 1 ? "" : "s"}
              {inspection.title ? ` · “${inspection.title}”` : ""}
            </Text>
          </Box>
        </Group>

        <Group gap={8}>
          <Badge
            color={
              worst === "fail" ? "red" : worst === "warn" ? "orange" : "green"
            }
            variant="light"
          >
            {worst === "fail"
              ? "Needs attention"
              : worst === "warn"
                ? "Check before imposing"
                : "Preflight passed"}
          </Badge>
          <Badge color={isPdfX ? "green" : "gray"} variant="light">
            {inspection.standard.label}
          </Badge>
          <Badge color={tone.color} variant="light">
            {inspection.color.mode}
          </Badge>
          <Badge
            color={inspection.uniformPageSize ? "green" : "orange"}
            variant="light"
          >
            {inspection.uniformPageSize ? "Uniform size" : "Mixed sizes"}
          </Badge>
        </Group>
      </Group>

      <Stack gap={12}>
        <Box>
          <Text
            size="xs"
            c={ink.faint}
            fw={700}
            tt="uppercase"
            lts={0.6}
            mb={8}
          >
            Preflight checks
          </Text>
          <Stack gap={8}>
            {checks.map((check) => (
              <CheckRow key={check.id} check={check} />
            ))}
          </Stack>
        </Box>

        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing={12}>
          <Tile
            label="Pages"
            value={`${inspection.pageCount} page${inspection.pageCount === 1 ? "" : "s"}`}
            sub="In the uploaded file."
          />
          <Tile
            label="Page size"
            value={formatBox(inspection.pageSize, unit)}
            sub={
              inspection.uniformPageSize
                ? "All pages match."
                : "Pages vary — first page shown."
            }
            action={unitToggle}
          />
          <Tile
            label="Trim box"
            value={
              inspection.trimBox
                ? formatBox(inspection.trimBox, unit)
                : "Not set"
            }
            sub={
              inspection.trimBox
                ? "Finished size after cutting."
                : "Page size will be used as trim."
            }
          />
          <Tile
            label="Bleed box"
            value={
              inspection.bleedBox
                ? formatBox(inspection.bleedBox, unit)
                : "Not set"
            }
            sub={
              inspection.bleedBox
                ? "Artwork extends past trim."
                : "No bleed declared."
            }
          />
          <Tile
            label="Colour mode"
            value={
              <Tooltip
                label={inspection.color.basis}
                multiline
                w={280}
                withArrow
              >
                <span>{inspection.color.mode}</span>
              </Tooltip>
            }
            sub={
              inspection.color.spaces.length > 0
                ? inspection.color.spaces.join(" · ")
                : tone.hint
            }
          />
          <Tile
            label="PDF type"
            value={inspection.standard.label}
            sub={
              inspection.standard.source === "none"
                ? "No ISO subset declared."
                : `Declared in ${inspection.standard.source === "xmp" ? "XMP metadata" : inspection.standard.source === "info" ? "the document info" : "the file body"}.`
            }
          />
          <Tile
            label="PDF version"
            value={
              inspection.pdfVersion ? `PDF ${inspection.pdfVersion}` : "Unknown"
            }
            sub={[
              inspection.encrypted ? "Encrypted" : "Not encrypted",
              inspection.linearized ? "linearized" : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          />
          <Tile
            label="Generator"
            value={inspection.creator ?? "Not recorded"}
            sub="The application that made the document."
          />
          <Tile
            label="Producer"
            value={inspection.producer ?? "Not recorded"}
            sub="The library that wrote the PDF."
          />
        </SimpleGrid>

        <Text size="xs" c={ink.faint}>
          {inspection.color.basis}
        </Text>
      </Stack>
    </Card>
  );
}
