{
  description = "FMI Calendar Generator - UBB Cluj schedule to .ics";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  };

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f {
        pkgs = nixpkgs.legacyPackages.${system};
      });
    in {
      devShells = forAllSystems ({ pkgs }:
        let
          python = pkgs.python312;
          pythonWithPkgs = python.withPackages (ps: with ps; [
            requests
            beautifulsoup4
            icalendar
            jinja2
            pyyaml
            pytest
            pip
          ]);
        in {
          default = pkgs.mkShell {
            packages = [ pythonWithPkgs ];

            shellHook = ''
              echo "fmi-cal-generator dev shell"
              echo "Run: pip install --user InquirerPy  (not in nixpkgs)"
            '';
          };
        });
    };
}
