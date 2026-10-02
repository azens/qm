import type { LocaleCatalog } from "../i18n.ts";
import { zhCNAdminShell } from "./zh-CN.admin-shell.ts";
import { zhCNAdminUi } from "./zh-CN.admin-ui.ts";
import { zhCNDisambiguation } from "./zh-CN.disambiguation.ts";
import { zhCNWebUiCore } from "./zh-CN.web-ui-core.ts";
import { zhCNWebUiMore } from "./zh-CN.web-ui-more.ts";
import { zhCNWebUiViews } from "./zh-CN.web-ui-views.ts";
import { zhCNWebUiExtra } from "./zh-CN.web-ui-extra.ts";

const zhCNShared: LocaleCatalog = {
  "just now": "刚刚",
  "{minutes}m ago": "{minutes} 分钟前",
  "{hours}h ago": "{hours} 小时前",
  "{days}d ago": "{days} 天前",
  "in {minutes}m": "{minutes} 分钟后",
  "in {hours}h": "{hours} 小时后",
  "in {days}d": "{days} 天后",
  Language: "语言",
  "{count} item": "{count} 个项目",
  "{count} items": "{count} 个项目",
};

export const zhCN: LocaleCatalog = {
  ...zhCNShared,
  ...zhCNWebUiCore,
  ...zhCNAdminShell,
  ...zhCNAdminUi,
  ...zhCNWebUiViews,
  ...zhCNWebUiMore,
  ...zhCNWebUiExtra,
  ...zhCNDisambiguation,
};
