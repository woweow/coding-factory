import { expect, test } from "@playwright/test"

const sparseWorkflow = (name: string) => ({
  name,
  entry: "only",
  agent: {
    model: { id: "composer-2.5", params: [{ id: "fast", value: "false" }] },
    cloud: {
      repos: [{ url: "https://github.com/woweow/coding-factory", startingRef: "main" }]
    }
  },
  steps: [{ id: "only", mode: "agent" }]
})

const workflowJson = (name: string): string => JSON.stringify(sparseWorkflow(name), null, 2)

const expectStoredSparseJson = async (page: import("@playwright/test").Page) => {
  const value = await page.getByTestId("json-editor").inputValue()
  expect(value).toMatch(/"mode": "agent"/)
  expect(value).not.toMatch(/systemPrompt/)
  expect(value).not.toMatch(/"routes"/)
}

test("UI CRUD plus a successful pass-json run over RPC", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByTestId("workflow-row-pass-json")).toBeVisible()
  await expect(page.getByTestId("workflow-row-ping-implement-review-pr")).toBeVisible()

  await page.getByRole("link", { name: "New workflow" }).click()
  await expect(page.getByTestId("json-editor")).toBeVisible()
  await page.getByTestId("json-editor").fill(workflowJson("e2e-created"))
  await page.getByTestId("save-workflow").click()
  await expect(page.getByTestId("workflow-name")).toHaveText("e2e-created")
  await expectStoredSparseJson(page)

  await page.getByTestId("json-editor").fill(workflowJson("e2e-updated"))
  await page.getByTestId("save-workflow").click()
  await expect(page.getByTestId("workflow-name")).toHaveText("e2e-updated")
  await expectStoredSparseJson(page)

  await page.getByTestId("delete-workflow").click()
  await expect(page.getByTestId("workflow-list")).toBeVisible()
  await expect(page.getByTestId("workflow-row-e2e-updated")).toHaveCount(0)
  await expect(page.getByTestId("workflow-row-pass-json")).toBeVisible()

  await page.getByTestId("show-deleted").click()
  await expect(page).toHaveURL(/showDeleted=true/)
  await expect(page.getByTestId("workflow-row-e2e-updated")).toBeVisible()

  await page.getByTestId("workflow-row-e2e-updated").getByRole("link").click()
  await expect(page.getByTestId("workflow-name")).toHaveText("e2e-updated")
  await expect(page.getByTestId("json-editor")).toBeVisible()
  await expect(page.getByTestId("save-workflow")).toHaveCount(0)
  await expect(page.getByTestId("delete-workflow")).toHaveCount(0)

  await page.goto("/?showDeleted=true")
  await page.getByTestId("workflow-row-pass-json").getByRole("link").click()
  await expect(page.getByTestId("workflow-name")).toHaveText("pass-json")
  await page.getByTestId("run-workflow").click()
  await expect(page.getByTestId("run-state")).toHaveText("completed", { timeout: 60_000 })
  await expect(page.getByTestId("run-steps")).toBeVisible()
})
