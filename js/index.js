(function(){
  document.addEventListener('DOMContentLoaded', function() {
    let $$ = selector => Array.from(document.querySelectorAll(selector));
    let $ = selector => document.querySelector(selector);

    let tryPromise = fn => Promise.resolve().then(fn);

    let toJson = obj => obj.json();
    let toText = obj => obj.text();

    let cy;

    let $stylesheet = $('#style');
    let getStylesheet = name => {
      let convert = res => name.match(/[.]json$/) ? toJson(res) : toText(res);

      return fetch(`stylesheets/${name}`).then(convert);
    };
    let applyStylesheet = stylesheet => {
      if (typeof stylesheet === typeof '') {
        cy.style().fromString(stylesheet).update();
      } else {
        cy.style().fromJson(stylesheet).update();
      }
    };
    let applyStylesheetFromSelect = () => Promise.resolve($stylesheet.value).then(getStylesheet).then(applyStylesheet);

    let $dataset = $('#data');
    let getDataset = name => fetch(`datasets/${name}`).then(toJson);
    let applyDataset = dataset => {
      // so new eles are offscreen
      cy.zoom(0.001);
      cy.pan({x: -9999999, y: -9999999});

      // replace eles
      cy.elements().remove();
      cy.add(dataset);
    };
    let applyDatasetFromSelect = () => Promise.resolve($dataset.value).then(getDataset).then(applyDataset);

    let calculateCachedCentrality = () => {
      let nodes = cy.nodes();

      if (nodes.length > 0 && nodes[0].data('centrality') == null) {
        let centrality = cy.elements().closenessCentralityNormalized();

        nodes.forEach(n => n.data('centrality', centrality.closeness(n)));
      }
    };

    let $layout = $('#layout');
    let maxLayoutDuration = 1500;
    let layoutPadding = 50;
    let concentric = function (node) {
      calculateCachedCentrality();

      return node.data('centrality');
    };
    let levelWidth = function (nodes) {
      calculateCachedCentrality();

      let min = nodes.min(n => n.data('centrality')).value;
      let max = nodes.max(n => n.data('centrality')).value;


      return (max - min) / 5;
    };
    let layouts = {
      cola: {
        name: 'cola',
        padding: layoutPadding,
        nodeSpacing: 12,
        edgeLengthVal: 45,
        animate: true,
        randomize: true,
        maxSimulationTime: maxLayoutDuration,
        boundingBox: { // to give cola more space to resolve initial overlaps
          x1: 0,
          y1: 0,
          x2: 10000,
          y2: 10000
        },
        edgeLength: function (e) {
          let w = e.data('weight');

          if (w == null) {
            w = 0.5;
          }

          return 45 / w;
        }
      },
      concentricCentrality: {
        name: 'concentric',
        padding: layoutPadding,
        animate: true,
        animationDuration: maxLayoutDuration,
        concentric: concentric,
        levelWidth: levelWidth
      },
      concentricHierarchyCentrality: {
        name: 'concentric',
        padding: layoutPadding,
        animate: true,
        animationDuration: maxLayoutDuration,
        concentric: concentric,
        levelWidth: levelWidth,
        sweep: Math.PI * 2 / 3,
        clockwise: true,
        startAngle: Math.PI * 1 / 6
      },
      custom: { // replace with your own layout parameters
        name: 'preset',
        padding: layoutPadding
      }
    };
    let prevLayout;
    let getLayout = name => Promise.resolve(layouts[name]);
    let applyLayout = layout => {
      if (prevLayout) {
        prevLayout.stop();
      }

      let l = prevLayout = cy.makeLayout(layout);

      return l.run().promiseOn('layoutstop');
    };
    let applyLayoutFromSelect = () => Promise.resolve($layout.value).then(getLayout).then(applyLayout);

    let $algorithm = $('#algorithm');
    let getAlgorithm = (name) => {
      switch (name) {
        case 'bfs':
          return Promise.resolve(cy.elements().bfs.bind(cy.elements()));
        case 'dfs':
          return Promise.resolve(cy.elements().dfs.bind(cy.elements()));
        case 'astar':
          return Promise.resolve(cy.elements().aStar.bind(cy.elements()));
        case 'none':
          return Promise.resolve(undefined);
        case 'custom':
          console.log(cy.elements);
        default:
          return Promise.resolve(undefined);
      }
    };
    let runAlgorithm = (algorithm) => {
      if (algorithm === undefined) {
        return Promise.resolve(undefined);
      } else {
        let options = {
          root: '#' + cy.nodes()[0].id(),
          // astar requires target; goal property is ignored for other algorithms
          goal: '#' + cy.nodes()[Math.round(Math.random() * (cy.nodes().size() - 1))].id()
        };
        return Promise.resolve(algorithm(options));
      }
    };
    let currentAlgorithm;
    let animateAlgorithm = (algResults) => {
      // clear old algorithm results
      cy.$().removeClass('highlighted start end');
      currentAlgorithm = algResults;
      if (algResults === undefined || algResults.path === undefined) {
        return Promise.resolve();
      } else {
        let i = 0;
        // for astar, highlight first and final before showing path
        if (algResults.distance) {
          // Among DFS, BFS, A*, only A* will have the distance property defined
          algResults.path.first().addClass('highlighted start');
          algResults.path.last().addClass('highlighted end');
          // i is not advanced to 1, so start node is effectively highlighted twice.
          // this is intentional; creates a short pause between highlighting ends and highlighting the path
        }
        return new Promise(resolve => {
          let highlightNext = () => {
            if (currentAlgorithm === algResults && i < algResults.path.length) {
              algResults.path[i].addClass('highlighted');
              i++;
              setTimeout(highlightNext, 500);
            } else {
              // resolve when finished or when a new algorithm has started visualization
              resolve();
            }
          };
          highlightNext();
        });
      }
    };
    let applyAlgorithmFromSelect = () => Promise.resolve($algorithm.value).then(getAlgorithm).then(runAlgorithm).then(animateAlgorithm);

    cy = window.cy = cytoscape({
      container: $('#cy')
    });

    tryPromise(applyDatasetFromSelect).then(applyStylesheetFromSelect).then(applyLayoutFromSelect);

    $dataset.addEventListener('change', function () {
      tryPromise(applyDatasetFromSelect).then(applyLayoutFromSelect).then(applyAlgorithmFromSelect);
    });

    $stylesheet.addEventListener('change', applyStylesheetFromSelect);

    $layout.addEventListener('change', applyLayoutFromSelect);

    $('#redo-layout').addEventListener('click', applyLayoutFromSelect);

    $algorithm.addEventListener('change', applyAlgorithmFromSelect);

    $('#redo-algorithm').addEventListener('click', applyAlgorithmFromSelect);

    $('#addToGraph').addEventListener('submit', function (e) {
      e.preventDefault();
      let node1 = $('#node').value;
      let edge1 = $('#edge1').value;
      let edge2 = $('#edge2').value;
      let weight = $('#weight1').value;
      var eles = cy.add([
        {group: 'nodes', data: {id: node1}},
        {group: 'edges', data: {id: edge1 + edge2, source: edge1, target: edge2, weight: weight}}
      ]);
    });
    $('#kruskal').addEventListener('click', function (e) {
      e.preventDefault();
      let mst = cy.collection();
      for (let i = 1; i < cy.nodes().length && mst.length < cy.nodes().length - 1; i++) {
        let closest = cy.collection().add(cy.edges()[i]);
        for (let i = 0; i < cy.edges().length-1; i++){
          let v = cy.edges()[i].data('source');
          let w = cy.edges()[i].data('target');
          let j = cy.$('#'+v).connectedEdges();
          let k = cy.$('#'+w).connectedEdges();
          let less = (a, b) => a < b;
          if (j.data('id') == k.data('id')){
            continue;
          }
          if (closest.filter('#'+j.data('id') || less(cy.edges()[i].data('weight'), j.data('weight')))){
            closest.add(cy.edges()[i]);
          }
          if (closest.filter('#'+k.data('id') || less(cy.edges()[i].data('weight'), k.data('weight')))){
            closest.add(cy.edges()[i]);
          }
          for (let l = 0; l < cy.edges().length; l++){
            let e = closest.filter('#'+cy.edges()[l].data('id'));
            if (e.length > 0){
              let v = e.data('source');
              let w = e.data('target');
              if (cy.$('#'+v).connectedEdges().data() != cy.$('#'+w).connectedEdges().data()){
                mst = mst.cy().add(e);
              }
            }
          }
        }
        mst.animate({
          position: { x: 100, y: 100 },
          style: { lineColor: 'red' },
        }, {
          duration: 1000
        });
      }
    });
    cy.on('click', 'node', function(evt){
      let nodeToBeRemoved = evt.cyTarget.data('id');
      cy.remove("#"+nodeToBeRemoved);
    });

  })
})();
// tooltips with jQuery
$(document).ready(() => $('.tooltip').tooltipster());