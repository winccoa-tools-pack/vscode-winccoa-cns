.PHONY: all clean clean-all install build package package-target \
        dev quick watch rebuild typecheck test-local info help

# ── Variables ─────────────────────────────────────────────────────────
BIN_DIR        := bin
EXTENSION_NAME := winccoa-cns
VERSION        := $(shell node -p "require('./package.json').version")
EXT_PUBLISHER  := RichardJanisch
EXT_ID         := $(EXT_PUBLISHER).$(EXTENSION_NAME)
NPM            := npm
VSCE           := npx @vscode/vsce
PLATFORM       := $(shell node -p "process.platform")
ARCH           := $(shell node -p "process.arch")

# Test workspace configuration
TEST_WORKSPACE ?= .
CODE_BIN       ?= code

# ── Default ───────────────────────────────────────────────────────────
all: clean install build package

# ── Clean ─────────────────────────────────────────────────────────────
clean:
	@echo "Cleaning build artifacts..."
	@rm -rf dist $(BIN_DIR)
	@echo "Clean complete."

clean-all: clean
	@echo "Removing node_modules..."
	@rm -rf node_modules
	@echo "Clean-all complete."

# ── Install ───────────────────────────────────────────────────────────
install:
	@echo "Installing dependencies..."
	@$(NPM) install
	@echo "Dependencies installed."

# ── Build ─────────────────────────────────────────────────────────────
build:
	@echo "Building extension..."
	@$(NPM) run build
	@echo "Build complete."

typecheck:
	@echo "Type-checking..."
	@$(NPM) run typecheck
	@echo "Typecheck passed."

# ── Package ───────────────────────────────────────────────────────────
package:
	@echo "Packaging VSIX..."
	@mkdir -p $(BIN_DIR)
	@$(VSCE) package --out $(BIN_DIR)/$(EXTENSION_NAME)-$(VERSION).vsix
	@echo "Packaged: $(BIN_DIR)/$(EXTENSION_NAME)-$(VERSION).vsix"

package-target:
	@echo "Packaging platform-specific VSIX ($(PLATFORM)-$(ARCH))..."
	@mkdir -p $(BIN_DIR)
	@$(VSCE) package --target $(PLATFORM)-$(ARCH) \
		--out $(BIN_DIR)/$(EXTENSION_NAME)-$(VERSION)-$(PLATFORM)-$(ARCH).vsix
	@echo "Packaged: $(BIN_DIR)/$(EXTENSION_NAME)-$(VERSION)-$(PLATFORM)-$(ARCH).vsix"

# ── Dev shortcuts ─────────────────────────────────────────────────────
dev: build package

quick: build package

watch:
	@$(NPM) run watch

rebuild: clean-all install build

# ── Test ──────────────────────────────────────────────────────────────
test-local: build package
	@node scripts/test-local.js $(BIN_DIR) $(EXTENSION_NAME) $(VERSION) \
		$(EXT_ID) $(CODE_BIN) $(TEST_WORKSPACE)

# ── Info ──────────────────────────────────────────────────────────────
info:
	@echo "Extension:  $(EXT_ID) v$(VERSION)"
	@echo "Platform:   $(PLATFORM)-$(ARCH)"

# ── Help ──────────────────────────────────────────────────────────────
help:
	@echo ""
	@echo "Usage: make <target>"
	@echo ""
	@echo "Build & Package:"
	@echo "  all              Clean, install, build, package (default)"
	@echo "  install          Install npm dependencies"
	@echo "  build            Bundle with esbuild → dist/extension.js"
	@echo "  typecheck        Run TypeScript type-check (no emit)"
	@echo "  package          Create .vsix in bin/"
	@echo "  package-target   Create platform-specific .vsix in bin/"
	@echo "  dev              Build + package"
	@echo "  quick            Build + package (no clean/install)"
	@echo ""
	@echo "Development:"
	@echo "  watch            esbuild watch mode (auto-recompile on save)"
	@echo "  test-local       Build, install into VS Code, open workspace"
	@echo ""
	@echo "Housekeeping:"
	@echo "  clean            Remove dist/, bin/"
	@echo "  clean-all        clean + remove node_modules/"
	@echo "  rebuild          clean-all + install + build"
	@echo "  info             Show current build environment"
	@echo ""
	@echo "Options:"
	@echo "  TEST_WORKSPACE   Path to WinCC OA project  (default: .)"
	@echo "  CODE_BIN         VS Code binary             (default: code)"
	@echo ""
