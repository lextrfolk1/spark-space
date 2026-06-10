import { Card } from "../../../components/shared/ui";

const settingCards = [
  {
    title: "Execution Controls",
    body: "Timeouts, row limits, and notebook defaults are driven from YAML plus environment overrides.",
  },
  {
    title: "Storage Strategy",
    body: "Local and S3-compatible storage providers can back dataset uploads without changing the dataset contract.",
  },
  {
    title: "Rule Engine Readiness",
    body: "The editor speaks to a generic execution API so parser and planner swaps do not force a front-end redesign.",
  },
];

export function SettingsPage() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {settingCards.map((card) => (
        <Card key={card.title} className="p-5">
          <p className="font-display text-xl">{card.title}</p>
          <p className="mt-3 text-sm text-muted">{card.body}</p>
        </Card>
      ))}
    </div>
  );
}

