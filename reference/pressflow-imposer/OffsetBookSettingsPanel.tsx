import { Box, Group, Radio, Select, Stack, Text } from "@mantine/core";
import type { ImpositionPlan } from "./layout";
import { pagesPerSheet, physicalSheetCount } from "./layout";
import { LengthInput } from "./LengthInput";
import { PlanSummary, Section, SettingsCard } from "./panelParts";
import { plateLibrary, sheetLibrary } from "./sheetLibrary";
import { SheetSizeFields } from "./SheetSizeFields";
import type { ImpositionSettings, LotPotPosition, OffsetOutput, PlateSetting, SourceSummary } from "./types";
import { formatSizeMm, pointsToMm } from "./units";

interface OffsetBookSettingsPanelProps {
  settings: ImpositionSettings;
  source: SourceSummary;
  plan: ImpositionPlan;
  onChange: (patch: Partial<ImpositionSettings>) => void;
}

/**
 * Mirrors the Corel Offset Book Impose tool: output size, head-to-head gutter, the
 * 4-page or 8-page plate map, and whether signatures nest for center-pin stitching.
 * The output is either a press sheet or, imposing straight to plate, the plate.
 */
export function OffsetBookSettingsPanel({
  settings,
  source,
  plan,
  onChange,
}: OffsetBookSettingsPanelProps) {
  const unit = settings.unit;
  const onPlate = settings.offsetOutput === "plate";
  const perSheet = pagesPerSheet(settings.plateSetting);
  // A 4-page plate job with 4 pages left over after its full sheets.
  const needsLotPot = settings.plateSetting === "4-page" && source.pageCount % perSheet === 4;
  const pageWidthMm = source.pageSize
    ? pointsToMm(source.pageSize.width)
    : null;
  const pageHeightMm = source.pageSize
    ? pointsToMm(source.pageSize.height)
    : null;

  const outputSelect = (
    <Select
      label="Output"
      w={120}
      value={settings.offsetOutput}
      onChange={(value) => value && onChange({ offsetOutput: value as OffsetOutput })}
      data={[
        { value: "sheet", label: "Sheet" },
        { value: "plate", label: "Plate" },
      ]}
      allowDeselect={false}
    />
  );

  return (
    <SettingsCard
      title="Offset Book Settings"
      hint="Press signatures laid out front and back on a larger sheet, ready to fold."
      unit={unit}
      onUnitChange={(next) => onChange({ unit: next })}
    >
      <Section
        title="Print on"
        description={
          onPlate
            ? "The signature is imposed straight onto the press plate."
            : "The signature is imposed onto a press sheet."
        }
      >
        {onPlate ? (
          <SheetSizeFields
            key="plate"
            unit={unit}
            widthMm={settings.plateWidthMm}
            heightMm={settings.plateHeightMm}
            onChange={({ widthMm, heightMm }) => onChange({ plateWidthMm: widthMm, plateHeightMm: heightMm })}
            library={plateLibrary}
            label="Plate size"
            leading={outputSelect}
          />
        ) : (
          <SheetSizeFields
            key="sheet"
            unit={unit}
            widthMm={settings.sheetWidthMm}
            heightMm={settings.sheetHeightMm}
            onChange={({ widthMm, heightMm }) => onChange({ sheetWidthMm: widthMm, sheetHeightMm: heightMm })}
            library={sheetLibrary}
            leading={outputSelect}
          />
        )}
      </Section>

      <Section title="Signature">
        <Radio.Group
          value={settings.plateSetting}
          onChange={(value) => onChange({ plateSetting: value as PlateSetting })}
        >
          <Group gap="xl">
            <Radio color="brand" value="4-page" label="4-Page plate" />
            <Radio color="brand" value="8-page" label="8-Page plate" />
          </Group>
        </Radio.Group>
        <LengthInput
          label="Gutter"
          description="Head-to-head gap between the two rows. Spines abut; on the 8-page plate the gutter also separates the inner columns."
          valueMm={settings.offsetGutterMm}
          unit={unit}
          onChangeMm={(mm) => onChange({ offsetGutterMm: mm })}
        />
      </Section>

      <Section
        title="Binding"
        description={
          settings.centerPin
            ? "Signatures nest inside one another for saddle stitching: the outer sheet carries the first and last pages."
            : "Signatures are stacked in page order for section-sewn or perfect binding."
        }
      >
        <Radio.Group
          value={settings.centerPin ? "center-pin" : "normal"}
          onChange={(value) => onChange({ centerPin: value === "center-pin" })}
        >
          <Group gap="xl">
            <Radio color="brand" value="center-pin" label="Center Pin" />
            <Radio color="brand" value="normal" label="Normal Bind" />
          </Group>
        </Radio.Group>
        {settings.plateSetting === "8-page" && (
          <Text size="xs" c="dimmed">
            {settings.centerPin
              ? `The 8-page plate needs a page count that is a multiple of ${perSheet} for Center Pin.`
              : `On the 8-page plate, a page count that is not a multiple of ${perSheet} leaves empty slots on the last sheet.`}
          </Text>
        )}
        {needsLotPot && (
          <Stack gap={8}>
            <Text size="sm" c="dimmed">
              {source.pageCount} pages leaves 4 over after the full sheets. Those 4 print as a Lot-Pot: one
              plate printed on both sides of the sheet, which is then cut in two.
            </Text>
            {settings.centerPin ? (
              <Radio.Group
                value={settings.lotPotPosition}
                onChange={(value) => onChange({ lotPotPosition: value as LotPotPosition })}
              >
                <Group gap="xl">
                  <Radio color="brand" value="title" label="Title Lot-Pot" />
                  <Radio color="brand" value="inner" label="Inner Lot-Pot" />
                </Group>
              </Radio.Group>
            ) : (
              <Text size="xs" c="dimmed">Normal Bind always makes the last 4 pages the Lot-Pot.</Text>
            )}
            {settings.centerPin && (
              <Text size="xs" c="dimmed">
                {settings.lotPotPosition === "title"
                  ? `Pages 1, 2, ${source.pageCount - 1} and ${source.pageCount} form the Lot-Pot, printed first; the rest nest inside it.`
                  : "The outer sheets nest as usual; the innermost 4 pages form the Lot-Pot, printed last."}
              </Text>
            )}
          </Stack>
        )}
      </Section>

      <Section title="Source" description="Read from the uploaded job.">
        <Group gap="xl">
          <Box>
            <Text size="xs" c="dimmed" fw={700}>
              Page
            </Text>
            <Text fw={800} size="sm">
              {pageWidthMm && pageHeightMm
                ? formatSizeMm(pageWidthMm, pageHeightMm, unit)
                : "—"}
            </Text>
          </Box>
          <Box>
            <Text size="xs" c="dimmed" fw={700}>
              Pages
            </Text>
            <Text fw={800} size="sm">
              {source.pageCount}
            </Text>
          </Box>
          <Box>
            <Text size="xs" c="dimmed" fw={700}>
              Sheets
            </Text>
            <Text fw={800} size="sm">
              {plan.error ? "—" : physicalSheetCount(plan)}
            </Text>
          </Box>
        </Group>
      </Section>

      <PlanSummary title="Signature plan" plan={plan} />
    </SettingsCard>
  );
}
