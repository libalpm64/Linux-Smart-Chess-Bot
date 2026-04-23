package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"strings"
)

type EngineResponse struct {
	Fen    string     `json:"fen"`
	Lines  []MoveLine `json:"lines"`
	Turn   string     `json:"turn"`
	Depth  int        `json:"depth"`
	Engine string     `json:"engine"`
}

type MoveLine struct {
	Moves     []string `json:"moves"`
	Score     int      `json:"score"`
	ScoreType string   `json:"scoreType"`
	Depth     int      `json:"depth"`
}

func loadEngines() (map[string]string, string) {
	engines := make(map[string]string)
	files, _ := os.ReadDir("engines/bin")
	for _, f := range files {
		if !f.IsDir() {
			name := f.Name()
			engines[name] = "engines/bin/" + name
		}
	}
	defaultEngine := ""
	for k := range engines {
		defaultEngine = k
		break
	}
	return engines, defaultEngine
}

var engines, defaultEngine = loadEngines()

func executeEngine(fen, depth, engineName string) ([]MoveLine, error) {
	enginePath, ok := engines[engineName]
	if !ok {
		enginePath, ok = engines[defaultEngine]
		if !ok {
			return nil, fmt.Errorf("no engines found")
		}
	}

	cmd := exec.Command(enginePath)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}

	if err := cmd.Start(); err != nil {
		return nil, err
	}

	fmt.Fprintf(stdin, "uci\n")
	scanner := bufio.NewScanner(stdout)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "uciok") {
			break
		}
	}

	fmt.Fprintf(stdin, "setoption name MultiPV value %d\n", 5)
	fmt.Fprintf(stdin, "ucinewgame\n")
	fmt.Fprintf(stdin, "isready\n")
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "readyok") {
			break
		}
	}
	fmt.Fprintf(stdin, "position fen %s\n", fen)
	fmt.Fprintf(stdin, "go depth %s\n", depth)
	stdin.Close()

	var lines []MoveLine
	pvLines := make(map[int]MoveLine)
	var maxDepth int

	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "bestmove ") {
			break
		}
		if strings.HasPrefix(line, "info depth ") {
			fields := strings.Fields(line)
			var score int
			var scoreType string = "cp"
			var pv []string
			var depth int
			var pvNum int = 1
			hasMultiPV := false

			for i, field := range fields {
				if field == "depth" && i+1 < len(fields) {
					depth, _ = strconv.Atoi(fields[i+1])
				}
				if field == "multipv" && i+1 < len(fields) {
					pvNum, _ = strconv.Atoi(fields[i+1])
					hasMultiPV = true
				}
				if field == "score" && i+2 < len(fields) {
					next := fields[i+1]
					if next == "cp" {
						score, _ = strconv.Atoi(fields[i+2])
						scoreType = "cp"
					} else if next == "mate" {
						score, _ = strconv.Atoi(fields[i+2])
						scoreType = "mate"
					}
				}
				if field == "pv" {
					pv = fields[i+1:]
					break
				}
			}

			if len(pv) > 0 {
				if hasMultiPV {
					pvLines[pvNum] = MoveLine{
						Moves:     pv,
						Score:     score,
						ScoreType: scoreType,
						Depth:     depth,
					}
				} else {
					if depth > maxDepth {
						maxDepth = depth
						pvLines[1] = MoveLine{
							Moves:     pv,
							Score:     score,
							ScoreType: scoreType,
							Depth:     depth,
						}
					}
				}
			}
		}
	}

	if len(pvLines) == 0 {
		return nil, fmt.Errorf("no moves found")
	}

	for i := 1; i <= len(pvLines); i++ {
		if line, ok := pvLines[i]; ok {
			lines = append(lines, line)
		}
	}

	cmd.Process.Kill()

	if len(lines) == 0 {
		return nil, fmt.Errorf("no moves found")
	}

	return lines, nil
}

func handler(w http.ResponseWriter, r *http.Request) {
	fen := r.URL.Query().Get("fen")
	if fen == "" {
		fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
	}
	depth := r.URL.Query().Get("depth")
	if depth == "" {
		depth = "10"
	}
	engineName := r.URL.Query().Get("engine")
	if engineName == "" {
		engineName = defaultEngine
	}

	lines, err := executeEngine(fen, depth, engineName)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	intDepth, _ := strconv.Atoi(depth)
	resp := EngineResponse{
		Fen:    fen,
		Lines:  lines,
		Turn:   "w",
		Depth:  intDepth,
		Engine: engineName,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func main() {
	http.HandleFunc("/getBestMove", handler)
	http.HandleFunc("/engines", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"engines": engines,
			"default": defaultEngine,
		})
	})

	fmt.Println("Listening on port 5000")
	log.Fatal(http.ListenAndServe(":5000", nil))
}
