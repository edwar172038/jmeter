/*
   Licensed to the Apache Software Foundation (ASF) under one or more
   contributor license agreements.  See the NOTICE file distributed with
   this work for additional information regarding copyright ownership.
   The ASF licenses this file to You under the Apache License, Version 2.0
   (the "License"); you may not use this file except in compliance with
   the License.  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
$(document).ready(function() {

    $(".click-title").mouseenter( function(    e){
        e.preventDefault();
        this.style.cursor="pointer";
    });
    $(".click-title").mousedown( function(event){
        event.preventDefault();
    });

    // Ugly code while this script is shared among several pages
    try{
        refreshHitsPerSecond(true);
    } catch(e){}
    try{
        refreshResponseTimeOverTime(true);
    } catch(e){}
    try{
        refreshResponseTimePercentiles();
    } catch(e){}
    $(".portlet-header").css("cursor", "auto");
});

var showControllersOnly = false;
var seriesFilter = "";
var filtersOnlySampleSeries = true;

// Fixes time stamps
function fixTimeStamps(series, offset){
    $.each(series, function(index, item) {
        $.each(item.data, function(index, coord) {
            coord[0] += offset;
        });
    });
}

// Check if the specified jquery object is a graph
function isGraph(object){
    return object.data('plot') !== undefined;
}

/**
 * Export graph to a PNG
 */
function exportToPNG(graphName, target) {
    var plot = $("#"+graphName).data('plot');
    var flotCanvas = plot.getCanvas();
    var image = flotCanvas.toDataURL();
    image = image.replace("image/png", "image/octet-stream");
    
    var downloadAttrSupported = ("download" in document.createElement("a"));
    if(downloadAttrSupported === true) {
        target.download = graphName + ".png";
        target.href = image;
    }
    else {
        document.location.href = image;
    }
    
}

// Override the specified graph options to fit the requirements of an overview
function prepareOverviewOptions(graphOptions){
    var overviewOptions = {
        series: {
            shadowSize: 0,
            lines: {
                lineWidth: 1
            },
            points: {
                // Show points on overview only when linked graph does not show
                // lines
                show: getProperty('series.lines.show', graphOptions) == false,
                radius : 1
            }
        },
        xaxis: {
            ticks: 2,
            axisLabel: null
        },
        yaxis: {
            ticks: 2,
            axisLabel: null
        },
        legend: {
            show: false,
            container: null
        },
        grid: {
            hoverable: false
        },
        tooltip: false
    };
    return $.extend(true, {}, graphOptions, overviewOptions);
}

// Force axes boundaries using graph extra options
function prepareOptions(options, data) {
    options.canvas = true;
    var extraOptions = data.extraOptions;
    if(extraOptions !== undefined){
        var xOffset = options.xaxis.mode === "time" ? 28800000 : 0;
        var yOffset = options.yaxis.mode === "time" ? 28800000 : 0;

        if(!isNaN(extraOptions.minX))
        	options.xaxis.min = parseFloat(extraOptions.minX) + xOffset;
        
        if(!isNaN(extraOptions.maxX))
        	options.xaxis.max = parseFloat(extraOptions.maxX) + xOffset;
        
        if(!isNaN(extraOptions.minY))
        	options.yaxis.min = parseFloat(extraOptions.minY) + yOffset;
        
        if(!isNaN(extraOptions.maxY))
        	options.yaxis.max = parseFloat(extraOptions.maxY) + yOffset;
    }
}

// Filter, mark series and sort data
/**
 * @param data
 * @param noMatchColor if defined and true, series.color are not matched with index
 */
function prepareSeries(data, noMatchColor){
    var result = data.result;

    // Keep only series when needed
    if(seriesFilter && (!filtersOnlySampleSeries || result.supportsControllersDiscrimination)){
        // Insensitive case matching
        var regexp = new RegExp(seriesFilter, 'i');
        result.series = $.grep(result.series, function(series, index){
            return regexp.test(series.label);
        });
    }

    // Keep only controllers series when supported and needed
    if(result.supportsControllersDiscrimination && showControllersOnly){
        result.series = $.grep(result.series, function(series, index){
            return series.isController;
        });
    }

    // Sort data and mark series
    $.each(result.series, function(index, series) {
        series.data.sort(compareByXCoordinate);
        if(!(noMatchColor && noMatchColor===true)) {
	        series.color = index;
	    }
    });
}

// Set the zoom on the specified plot object
function zoomPlot(plot, xmin, xmax, ymin, ymax){
    var axes = plot.getAxes();
    // Override axes min and max options
    $.extend(true, axes, {
        xaxis: {
            options : { min: xmin, max: xmax }
        },
        yaxis: {
            options : { min: ymin, max: ymax }
        }
    });

    // Redraw the plot
    plot.setupGrid();
    plot.draw();
}

// Prepares DOM items to add zoom function on the specified graph
function setGraphZoomable(graphSelector, overviewSelector){
    var graph = $(graphSelector);
    var overview = $(overviewSelector);

    // Ignore mouse down event
    graph.bind("mousedown", function() { return false; });
    overview.bind("mousedown", function() { return false; });

    // Zoom on selection
    graph.bind("plotselected", function (event, ranges) {
        // clamp the zooming to prevent infinite zoom
        if (ranges.xaxis.to - ranges.xaxis.from < 0.00001) {
            ranges.xaxis.to = ranges.xaxis.from + 0.00001;
        }
        if (ranges.yaxis.to - ranges.yaxis.from < 0.00001) {
            ranges.yaxis.to = ranges.yaxis.from + 0.00001;
        }

        // Do the zooming
        var plot = graph.data('plot');
        zoomPlot(plot, ranges.xaxis.from, ranges.xaxis.to, ranges.yaxis.from, ranges.yaxis.to);
        plot.clearSelection();

        // Synchronize overview selection
        overview.data('plot').setSelection(ranges, true);
    });

    // Zoom linked graph on overview selection
    overview.bind("plotselected", function (event, ranges) {
        graph.data('plot').setSelection(ranges);
    });

    // Reset linked graph zoom when reseting overview selection
    overview.bind("plotunselected", function () {
        var overviewAxes = overview.data('plot').getAxes();
        zoomPlot(graph.data('plot'), overviewAxes.xaxis.min, overviewAxes.xaxis.max, overviewAxes.yaxis.min, overviewAxes.yaxis.max);
    });
}

var responseTimePercentilesInfos = {
        data: {"result": {"supportsControllersDiscrimination": true, "series": [{"isController": false, "data": [[0.0, 98.0], [0.1, 98.0], [0.2, 98.0], [0.3, 98.0], [0.4, 98.0], [0.5, 98.0], [0.6, 98.0], [0.7, 98.0], [0.8, 98.0], [0.9, 98.0], [1.0, 101.0], [1.1, 101.0], [1.2, 101.0], [1.3, 101.0], [1.4, 101.0], [1.5, 101.0], [1.6, 101.0], [1.7, 101.0], [1.8, 101.0], [1.9, 101.0], [2.0, 103.0], [2.1, 103.0], [2.2, 103.0], [2.3, 103.0], [2.4, 103.0], [2.5, 103.0], [2.6, 103.0], [2.7, 103.0], [2.8, 103.0], [2.9, 103.0], [3.0, 103.0], [3.1, 103.0], [3.2, 103.0], [3.3, 103.0], [3.4, 103.0], [3.5, 103.0], [3.6, 103.0], [3.7, 103.0], [3.8, 103.0], [3.9, 103.0], [4.0, 109.0], [4.1, 109.0], [4.2, 109.0], [4.3, 109.0], [4.4, 109.0], [4.5, 109.0], [4.6, 109.0], [4.7, 109.0], [4.8, 109.0], [4.9, 109.0], [5.0, 114.0], [5.1, 114.0], [5.2, 114.0], [5.3, 114.0], [5.4, 114.0], [5.5, 114.0], [5.6, 114.0], [5.7, 114.0], [5.8, 114.0], [5.9, 114.0], [6.0, 115.0], [6.1, 115.0], [6.2, 115.0], [6.3, 115.0], [6.4, 115.0], [6.5, 115.0], [6.6, 115.0], [6.7, 115.0], [6.8, 115.0], [6.9, 115.0], [7.0, 116.0], [7.1, 116.0], [7.2, 116.0], [7.3, 116.0], [7.4, 116.0], [7.5, 116.0], [7.6, 116.0], [7.7, 116.0], [7.8, 116.0], [7.9, 116.0], [8.0, 116.0], [8.1, 116.0], [8.2, 116.0], [8.3, 116.0], [8.4, 116.0], [8.5, 116.0], [8.6, 116.0], [8.7, 116.0], [8.8, 116.0], [8.9, 116.0], [9.0, 116.0], [9.1, 116.0], [9.2, 116.0], [9.3, 116.0], [9.4, 116.0], [9.5, 116.0], [9.6, 116.0], [9.7, 116.0], [9.8, 116.0], [9.9, 116.0], [10.0, 118.0], [10.1, 118.0], [10.2, 118.0], [10.3, 118.0], [10.4, 118.0], [10.5, 118.0], [10.6, 118.0], [10.7, 118.0], [10.8, 118.0], [10.9, 118.0], [11.0, 118.0], [11.1, 118.0], [11.2, 118.0], [11.3, 118.0], [11.4, 118.0], [11.5, 118.0], [11.6, 118.0], [11.7, 118.0], [11.8, 118.0], [11.9, 118.0], [12.0, 118.0], [12.1, 118.0], [12.2, 118.0], [12.3, 118.0], [12.4, 118.0], [12.5, 118.0], [12.6, 118.0], [12.7, 118.0], [12.8, 118.0], [12.9, 118.0], [13.0, 118.0], [13.1, 118.0], [13.2, 118.0], [13.3, 118.0], [13.4, 118.0], [13.5, 118.0], [13.6, 118.0], [13.7, 118.0], [13.8, 118.0], [13.9, 119.0], [14.0, 119.0], [14.1, 119.0], [14.2, 119.0], [14.3, 119.0], [14.4, 119.0], [14.5, 119.0], [14.6, 119.0], [14.7, 119.0], [14.8, 119.0], [14.9, 122.0], [15.0, 122.0], [15.1, 122.0], [15.2, 122.0], [15.3, 122.0], [15.4, 122.0], [15.5, 122.0], [15.6, 122.0], [15.7, 122.0], [15.8, 122.0], [15.9, 122.0], [16.0, 122.0], [16.1, 122.0], [16.2, 122.0], [16.3, 122.0], [16.4, 122.0], [16.5, 122.0], [16.6, 122.0], [16.7, 122.0], [16.8, 122.0], [16.9, 123.0], [17.0, 123.0], [17.1, 123.0], [17.2, 123.0], [17.3, 123.0], [17.4, 123.0], [17.5, 123.0], [17.6, 123.0], [17.7, 123.0], [17.8, 123.0], [17.9, 123.0], [18.0, 123.0], [18.1, 123.0], [18.2, 123.0], [18.3, 123.0], [18.4, 123.0], [18.5, 123.0], [18.6, 123.0], [18.7, 123.0], [18.8, 123.0], [18.9, 124.0], [19.0, 124.0], [19.1, 124.0], [19.2, 124.0], [19.3, 124.0], [19.4, 124.0], [19.5, 124.0], [19.6, 124.0], [19.7, 124.0], [19.8, 124.0], [19.9, 124.0], [20.0, 124.0], [20.1, 124.0], [20.2, 124.0], [20.3, 124.0], [20.4, 124.0], [20.5, 124.0], [20.6, 124.0], [20.7, 124.0], [20.8, 124.0], [20.9, 124.0], [21.0, 124.0], [21.1, 124.0], [21.2, 124.0], [21.3, 124.0], [21.4, 124.0], [21.5, 124.0], [21.6, 124.0], [21.7, 124.0], [21.8, 125.0], [21.9, 125.0], [22.0, 125.0], [22.1, 125.0], [22.2, 125.0], [22.3, 125.0], [22.4, 125.0], [22.5, 125.0], [22.6, 125.0], [22.7, 125.0], [22.8, 126.0], [22.9, 126.0], [23.0, 126.0], [23.1, 126.0], [23.2, 126.0], [23.3, 126.0], [23.4, 126.0], [23.5, 126.0], [23.6, 126.0], [23.7, 126.0], [23.8, 126.0], [23.9, 126.0], [24.0, 126.0], [24.1, 126.0], [24.2, 126.0], [24.3, 126.0], [24.4, 126.0], [24.5, 126.0], [24.6, 126.0], [24.7, 126.0], [24.8, 128.0], [24.9, 128.0], [25.0, 128.0], [25.1, 128.0], [25.2, 128.0], [25.3, 128.0], [25.4, 128.0], [25.5, 128.0], [25.6, 128.0], [25.7, 128.0], [25.8, 128.0], [25.9, 128.0], [26.0, 128.0], [26.1, 128.0], [26.2, 128.0], [26.3, 128.0], [26.4, 128.0], [26.5, 128.0], [26.6, 128.0], [26.7, 128.0], [26.8, 128.0], [26.9, 128.0], [27.0, 128.0], [27.1, 128.0], [27.2, 128.0], [27.3, 128.0], [27.4, 128.0], [27.5, 128.0], [27.6, 128.0], [27.7, 128.0], [27.8, 129.0], [27.9, 129.0], [28.0, 129.0], [28.1, 129.0], [28.2, 129.0], [28.3, 129.0], [28.4, 129.0], [28.5, 129.0], [28.6, 129.0], [28.7, 129.0], [28.8, 129.0], [28.9, 129.0], [29.0, 129.0], [29.1, 129.0], [29.2, 129.0], [29.3, 129.0], [29.4, 129.0], [29.5, 129.0], [29.6, 129.0], [29.7, 129.0], [29.8, 130.0], [29.9, 130.0], [30.0, 130.0], [30.1, 130.0], [30.2, 130.0], [30.3, 130.0], [30.4, 130.0], [30.5, 130.0], [30.6, 130.0], [30.7, 130.0], [30.8, 130.0], [30.9, 130.0], [31.0, 130.0], [31.1, 130.0], [31.2, 130.0], [31.3, 130.0], [31.4, 130.0], [31.5, 130.0], [31.6, 130.0], [31.7, 131.0], [31.8, 131.0], [31.9, 131.0], [32.0, 131.0], [32.1, 131.0], [32.2, 131.0], [32.3, 131.0], [32.4, 131.0], [32.5, 131.0], [32.6, 131.0], [32.7, 133.0], [32.8, 133.0], [32.9, 133.0], [33.0, 133.0], [33.1, 133.0], [33.2, 133.0], [33.3, 133.0], [33.4, 133.0], [33.5, 133.0], [33.6, 133.0], [33.7, 134.0], [33.8, 134.0], [33.9, 134.0], [34.0, 134.0], [34.1, 134.0], [34.2, 134.0], [34.3, 134.0], [34.4, 134.0], [34.5, 134.0], [34.6, 134.0], [34.7, 135.0], [34.8, 135.0], [34.9, 135.0], [35.0, 135.0], [35.1, 135.0], [35.2, 135.0], [35.3, 135.0], [35.4, 135.0], [35.5, 135.0], [35.6, 135.0], [35.7, 135.0], [35.8, 135.0], [35.9, 135.0], [36.0, 135.0], [36.1, 135.0], [36.2, 135.0], [36.3, 135.0], [36.4, 135.0], [36.5, 135.0], [36.6, 135.0], [36.7, 136.0], [36.8, 136.0], [36.9, 136.0], [37.0, 136.0], [37.1, 136.0], [37.2, 136.0], [37.3, 136.0], [37.4, 136.0], [37.5, 136.0], [37.6, 136.0], [37.7, 138.0], [37.8, 138.0], [37.9, 138.0], [38.0, 138.0], [38.1, 138.0], [38.2, 138.0], [38.3, 138.0], [38.4, 138.0], [38.5, 138.0], [38.6, 138.0], [38.7, 139.0], [38.8, 139.0], [38.9, 139.0], [39.0, 139.0], [39.1, 139.0], [39.2, 139.0], [39.3, 139.0], [39.4, 139.0], [39.5, 139.0], [39.6, 139.0], [39.7, 140.0], [39.8, 140.0], [39.9, 140.0], [40.0, 140.0], [40.1, 140.0], [40.2, 140.0], [40.3, 140.0], [40.4, 140.0], [40.5, 140.0], [40.6, 140.0], [40.7, 140.0], [40.8, 140.0], [40.9, 140.0], [41.0, 140.0], [41.1, 140.0], [41.2, 140.0], [41.3, 140.0], [41.4, 140.0], [41.5, 140.0], [41.6, 140.0], [41.7, 140.0], [41.8, 140.0], [41.9, 140.0], [42.0, 140.0], [42.1, 140.0], [42.2, 140.0], [42.3, 140.0], [42.4, 140.0], [42.5, 140.0], [42.6, 140.0], [42.7, 140.0], [42.8, 140.0], [42.9, 140.0], [43.0, 140.0], [43.1, 140.0], [43.2, 140.0], [43.3, 140.0], [43.4, 140.0], [43.5, 140.0], [43.6, 141.0], [43.7, 141.0], [43.8, 141.0], [43.9, 141.0], [44.0, 141.0], [44.1, 141.0], [44.2, 141.0], [44.3, 141.0], [44.4, 141.0], [44.5, 141.0], [44.6, 142.0], [44.7, 142.0], [44.8, 142.0], [44.9, 142.0], [45.0, 142.0], [45.1, 142.0], [45.2, 142.0], [45.3, 142.0], [45.4, 142.0], [45.5, 142.0], [45.6, 143.0], [45.7, 143.0], [45.8, 143.0], [45.9, 143.0], [46.0, 143.0], [46.1, 143.0], [46.2, 143.0], [46.3, 143.0], [46.4, 143.0], [46.5, 143.0], [46.6, 144.0], [46.7, 144.0], [46.8, 144.0], [46.9, 144.0], [47.0, 144.0], [47.1, 144.0], [47.2, 144.0], [47.3, 144.0], [47.4, 144.0], [47.5, 144.0], [47.6, 145.0], [47.7, 145.0], [47.8, 145.0], [47.9, 145.0], [48.0, 145.0], [48.1, 145.0], [48.2, 145.0], [48.3, 145.0], [48.4, 145.0], [48.5, 145.0], [48.6, 145.0], [48.7, 145.0], [48.8, 145.0], [48.9, 145.0], [49.0, 145.0], [49.1, 145.0], [49.2, 145.0], [49.3, 145.0], [49.4, 145.0], [49.5, 145.0], [49.6, 147.0], [49.7, 147.0], [49.8, 147.0], [49.9, 147.0], [50.0, 147.0], [50.1, 147.0], [50.2, 147.0], [50.3, 147.0], [50.4, 147.0], [50.5, 147.0], [50.6, 147.0], [50.7, 147.0], [50.8, 147.0], [50.9, 147.0], [51.0, 147.0], [51.1, 147.0], [51.2, 147.0], [51.3, 147.0], [51.4, 147.0], [51.5, 148.0], [51.6, 148.0], [51.7, 148.0], [51.8, 148.0], [51.9, 148.0], [52.0, 148.0], [52.1, 148.0], [52.2, 148.0], [52.3, 148.0], [52.4, 148.0], [52.5, 148.0], [52.6, 148.0], [52.7, 148.0], [52.8, 148.0], [52.9, 148.0], [53.0, 148.0], [53.1, 148.0], [53.2, 148.0], [53.3, 148.0], [53.4, 148.0], [53.5, 148.0], [53.6, 148.0], [53.7, 148.0], [53.8, 148.0], [53.9, 148.0], [54.0, 148.0], [54.1, 148.0], [54.2, 148.0], [54.3, 148.0], [54.4, 148.0], [54.5, 148.0], [54.6, 148.0], [54.7, 148.0], [54.8, 148.0], [54.9, 148.0], [55.0, 148.0], [55.1, 148.0], [55.2, 148.0], [55.3, 148.0], [55.4, 148.0], [55.5, 149.0], [55.6, 149.0], [55.7, 149.0], [55.8, 149.0], [55.9, 149.0], [56.0, 149.0], [56.1, 149.0], [56.2, 149.0], [56.3, 149.0], [56.4, 149.0], [56.5, 150.0], [56.6, 150.0], [56.7, 150.0], [56.8, 150.0], [56.9, 150.0], [57.0, 150.0], [57.1, 150.0], [57.2, 150.0], [57.3, 150.0], [57.4, 150.0], [57.5, 150.0], [57.6, 150.0], [57.7, 150.0], [57.8, 150.0], [57.9, 150.0], [58.0, 150.0], [58.1, 150.0], [58.2, 150.0], [58.3, 150.0], [58.4, 150.0], [58.5, 150.0], [58.6, 150.0], [58.7, 150.0], [58.8, 150.0], [58.9, 150.0], [59.0, 150.0], [59.1, 150.0], [59.2, 150.0], [59.3, 150.0], [59.4, 150.0], [59.5, 152.0], [59.6, 152.0], [59.7, 152.0], [59.8, 152.0], [59.9, 152.0], [60.0, 152.0], [60.1, 152.0], [60.2, 152.0], [60.3, 152.0], [60.4, 152.0], [60.5, 152.0], [60.6, 152.0], [60.7, 152.0], [60.8, 152.0], [60.9, 152.0], [61.0, 152.0], [61.1, 152.0], [61.2, 152.0], [61.3, 152.0], [61.4, 152.0], [61.5, 152.0], [61.6, 152.0], [61.7, 152.0], [61.8, 152.0], [61.9, 152.0], [62.0, 152.0], [62.1, 152.0], [62.2, 152.0], [62.3, 152.0], [62.4, 154.0], [62.5, 154.0], [62.6, 154.0], [62.7, 154.0], [62.8, 154.0], [62.9, 154.0], [63.0, 154.0], [63.1, 154.0], [63.2, 154.0], [63.3, 154.0], [63.4, 156.0], [63.5, 156.0], [63.6, 156.0], [63.7, 156.0], [63.8, 156.0], [63.9, 156.0], [64.0, 156.0], [64.1, 156.0], [64.2, 156.0], [64.3, 156.0], [64.4, 157.0], [64.5, 157.0], [64.6, 157.0], [64.7, 157.0], [64.8, 157.0], [64.9, 157.0], [65.0, 157.0], [65.1, 157.0], [65.2, 157.0], [65.3, 157.0], [65.4, 161.0], [65.5, 161.0], [65.6, 161.0], [65.7, 161.0], [65.8, 161.0], [65.9, 161.0], [66.0, 161.0], [66.1, 161.0], [66.2, 161.0], [66.3, 161.0], [66.4, 162.0], [66.5, 162.0], [66.6, 162.0], [66.7, 162.0], [66.8, 162.0], [66.9, 162.0], [67.0, 162.0], [67.1, 162.0], [67.2, 162.0], [67.3, 162.0], [67.4, 162.0], [67.5, 162.0], [67.6, 162.0], [67.7, 162.0], [67.8, 162.0], [67.9, 162.0], [68.0, 162.0], [68.1, 162.0], [68.2, 162.0], [68.3, 162.0], [68.4, 163.0], [68.5, 163.0], [68.6, 163.0], [68.7, 163.0], [68.8, 163.0], [68.9, 163.0], [69.0, 163.0], [69.1, 163.0], [69.2, 163.0], [69.3, 163.0], [69.4, 167.0], [69.5, 167.0], [69.6, 167.0], [69.7, 167.0], [69.8, 167.0], [69.9, 167.0], [70.0, 167.0], [70.1, 167.0], [70.2, 167.0], [70.3, 169.0], [70.4, 169.0], [70.5, 169.0], [70.6, 169.0], [70.7, 169.0], [70.8, 169.0], [70.9, 169.0], [71.0, 169.0], [71.1, 169.0], [71.2, 169.0], [71.3, 171.0], [71.4, 171.0], [71.5, 171.0], [71.6, 171.0], [71.7, 171.0], [71.8, 171.0], [71.9, 171.0], [72.0, 171.0], [72.1, 171.0], [72.2, 171.0], [72.3, 173.0], [72.4, 173.0], [72.5, 173.0], [72.6, 173.0], [72.7, 173.0], [72.8, 173.0], [72.9, 173.0], [73.0, 173.0], [73.1, 173.0], [73.2, 173.0], [73.3, 175.0], [73.4, 175.0], [73.5, 175.0], [73.6, 175.0], [73.7, 175.0], [73.8, 175.0], [73.9, 175.0], [74.0, 175.0], [74.1, 175.0], [74.2, 175.0], [74.3, 177.0], [74.4, 177.0], [74.5, 177.0], [74.6, 177.0], [74.7, 177.0], [74.8, 177.0], [74.9, 177.0], [75.0, 177.0], [75.1, 177.0], [75.2, 177.0], [75.3, 178.0], [75.4, 178.0], [75.5, 178.0], [75.6, 178.0], [75.7, 178.0], [75.8, 178.0], [75.9, 178.0], [76.0, 178.0], [76.1, 178.0], [76.2, 178.0], [76.3, 180.0], [76.4, 180.0], [76.5, 180.0], [76.6, 180.0], [76.7, 180.0], [76.8, 180.0], [76.9, 180.0], [77.0, 180.0], [77.1, 180.0], [77.2, 180.0], [77.3, 180.0], [77.4, 180.0], [77.5, 180.0], [77.6, 180.0], [77.7, 180.0], [77.8, 180.0], [77.9, 180.0], [78.0, 180.0], [78.1, 180.0], [78.2, 180.0], [78.3, 184.0], [78.4, 184.0], [78.5, 184.0], [78.6, 184.0], [78.7, 184.0], [78.8, 184.0], [78.9, 184.0], [79.0, 184.0], [79.1, 184.0], [79.2, 184.0], [79.3, 186.0], [79.4, 186.0], [79.5, 186.0], [79.6, 186.0], [79.7, 186.0], [79.8, 186.0], [79.9, 186.0], [80.0, 186.0], [80.1, 186.0], [80.2, 187.0], [80.3, 187.0], [80.4, 187.0], [80.5, 187.0], [80.6, 187.0], [80.7, 187.0], [80.8, 187.0], [80.9, 187.0], [81.0, 187.0], [81.1, 187.0], [81.2, 190.0], [81.3, 190.0], [81.4, 190.0], [81.5, 190.0], [81.6, 190.0], [81.7, 190.0], [81.8, 190.0], [81.9, 190.0], [82.0, 190.0], [82.1, 190.0], [82.2, 195.0], [82.3, 195.0], [82.4, 195.0], [82.5, 195.0], [82.6, 195.0], [82.7, 195.0], [82.8, 195.0], [82.9, 195.0], [83.0, 195.0], [83.1, 195.0], [83.2, 197.0], [83.3, 197.0], [83.4, 197.0], [83.5, 197.0], [83.6, 197.0], [83.7, 197.0], [83.8, 197.0], [83.9, 197.0], [84.0, 197.0], [84.1, 197.0], [84.2, 197.0], [84.3, 197.0], [84.4, 197.0], [84.5, 197.0], [84.6, 197.0], [84.7, 197.0], [84.8, 197.0], [84.9, 197.0], [85.0, 197.0], [85.1, 197.0], [85.2, 201.0], [85.3, 201.0], [85.4, 201.0], [85.5, 201.0], [85.6, 201.0], [85.7, 201.0], [85.8, 201.0], [85.9, 201.0], [86.0, 201.0], [86.1, 201.0], [86.2, 202.0], [86.3, 202.0], [86.4, 202.0], [86.5, 202.0], [86.6, 202.0], [86.7, 202.0], [86.8, 202.0], [86.9, 202.0], [87.0, 202.0], [87.1, 202.0], [87.2, 204.0], [87.3, 204.0], [87.4, 204.0], [87.5, 204.0], [87.6, 204.0], [87.7, 204.0], [87.8, 204.0], [87.9, 204.0], [88.0, 204.0], [88.1, 204.0], [88.2, 210.0], [88.3, 210.0], [88.4, 210.0], [88.5, 210.0], [88.6, 210.0], [88.7, 210.0], [88.8, 210.0], [88.9, 210.0], [89.0, 210.0], [89.1, 210.0], [89.2, 214.0], [89.3, 214.0], [89.4, 214.0], [89.5, 214.0], [89.6, 214.0], [89.7, 214.0], [89.8, 214.0], [89.9, 214.0], [90.0, 214.0], [90.1, 217.0], [90.2, 217.0], [90.3, 217.0], [90.4, 217.0], [90.5, 217.0], [90.6, 217.0], [90.7, 217.0], [90.8, 217.0], [90.9, 217.0], [91.0, 217.0], [91.1, 219.0], [91.2, 219.0], [91.3, 219.0], [91.4, 219.0], [91.5, 219.0], [91.6, 219.0], [91.7, 219.0], [91.8, 219.0], [91.9, 219.0], [92.0, 219.0], [92.1, 229.0], [92.2, 229.0], [92.3, 229.0], [92.4, 229.0], [92.5, 229.0], [92.6, 229.0], [92.7, 229.0], [92.8, 229.0], [92.9, 229.0], [93.0, 229.0], [93.1, 233.0], [93.2, 233.0], [93.3, 233.0], [93.4, 233.0], [93.5, 233.0], [93.6, 233.0], [93.7, 233.0], [93.8, 233.0], [93.9, 233.0], [94.0, 233.0], [94.1, 275.0], [94.2, 275.0], [94.3, 275.0], [94.4, 275.0], [94.5, 275.0], [94.6, 275.0], [94.7, 275.0], [94.8, 275.0], [94.9, 275.0], [95.0, 275.0], [95.1, 355.0], [95.2, 355.0], [95.3, 355.0], [95.4, 355.0], [95.5, 355.0], [95.6, 355.0], [95.7, 355.0], [95.8, 355.0], [95.9, 355.0], [96.0, 355.0], [96.1, 360.0], [96.2, 360.0], [96.3, 360.0], [96.4, 360.0], [96.5, 360.0], [96.6, 360.0], [96.7, 360.0], [96.8, 360.0], [96.9, 360.0], [97.0, 360.0], [97.1, 398.0], [97.2, 398.0], [97.3, 398.0], [97.4, 398.0], [97.5, 398.0], [97.6, 398.0], [97.7, 398.0], [97.8, 398.0], [97.9, 398.0], [98.0, 398.0], [98.1, 1072.0], [98.2, 1072.0], [98.3, 1072.0], [98.4, 1072.0], [98.5, 1072.0], [98.6, 1072.0], [98.7, 1072.0], [98.8, 1072.0], [98.9, 1072.0], [99.0, 1072.0], [99.1, 1295.0], [99.2, 1295.0], [99.3, 1295.0], [99.4, 1295.0], [99.5, 1295.0], [99.6, 1295.0], [99.7, 1295.0], [99.8, 1295.0], [99.9, 1295.0]], "label": "HTTP请求", "isOverall": false}], "title": "Response Time Percentiles", "maxY": 1295.0, "maxX": 100.0, "minX": 0.0, "minY": 98.0}},
        getOptions: function() {
            return {
                series: {
                    points: { show: false }
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentiles'
                },
                xaxis: {
                    tickDecimals: 1,
                    axisLabel: "Percentiles",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Percentile value in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : %x.2 percentile was %y ms"
                },
                selection: { mode: "xy" },
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentiles"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesPercentiles"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesPercentiles"), dataset, prepareOverviewOptions(options));
        }
};

// Response times percentiles
function refreshResponseTimePercentiles() {
    var infos = responseTimePercentilesInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimesPercentiles"))){
        infos.createGraph();
    } else {
        var choiceContainer = $("#choicesResponseTimePercentiles");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesPercentiles", "#overviewResponseTimesPercentiles");
        $('#bodyResponseTimePercentiles .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimeDistributionInfos = {
        data: {"result": {"supportsControllersDiscrimination": true, "series": [{"isController": false, "data": [[0.0, 99.0], [1000.0, 2.0]], "label": "HTTP请求", "isOverall": false}], "title": "Response Time Distribution", "granularity": 500, "maxY": 99.0, "maxX": 1000.0, "minX": 0.0, "minY": 2.0}},
        getOptions: function() {
            var granularity = this.data.result.granularity;
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    barWidth: this.data.result.granularity
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " responses for " + label + " were between " + xval + " and " + (xval + granularity) + " ms";
                    }
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimeDistribution"), prepareData(data.result.series, $("#choicesResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshResponseTimeDistribution() {
    var infos = responseTimeDistributionInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var syntheticResponseTimeDistributionInfos = {
        data: {"result": {"supportsControllersDiscrimination": false, "series": [{"isController": false, "data": [[1.0, 2.0]], "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isOverall": false}, {"isController": false, "data": [[0.0, 99.0]], "label": "Requests having \nresponse time <= 500ms", "isOverall": false}], "title": "Synthetic Response Times Distribution", "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 99.0, "maxX": 1.0, "minX": 0.0, "minY": 2.0}},
        getOptions: function() {
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendSyntheticResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times ranges",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                    tickLength:0,
                    min:-0.5,
                    max:3.5
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    align: "center",
                    barWidth: 0.25,
                    fill:.75
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " " + label;
                    }
                },
                colors: ["#9ACD32", "yellow", "orange", "#FF6347"]                
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            options.xaxis.ticks = data.result.ticks;
            $.plot($("#flotSyntheticResponseTimeDistribution"), prepareData(data.result.series, $("#choicesSyntheticResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshSyntheticResponseTimeDistribution() {
    var infos = syntheticResponseTimeDistributionInfos;
    prepareSeries(infos.data, true);
    if (isGraph($("#flotSyntheticResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerSyntheticResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var activeThreadsOverTimeInfos = {
        data: {"result": {"supportsControllersDiscrimination": false, "series": [{"isController": false, "data": [[1.48221402E12, 8.11], [1.48221396E12, 1.0]], "label": "线程组", "isOverall": false}], "title": "Active Threads Over Time", "granularity": 60000, "maxY": 8.11, "maxX": 1.48221402E12, "minX": 1.48221396E12, "minY": 1.0}},
        getOptions: function() {
            return {
                series: {
                    stack: true,
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 6,
                    show: true,
                    container: '#legendActiveThreadsOverTime'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                selection: {
                    mode: 'xy'
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : At %x there were %y active threads"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesActiveThreadsOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotActiveThreadsOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewActiveThreadsOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Active Threads Over Time
function refreshActiveThreadsOverTime(fixTimestamps) {
    var infos = activeThreadsOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotActiveThreadsOverTime"))) {
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesActiveThreadsOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotActiveThreadsOverTime", "#overviewActiveThreadsOverTime");
        $('#footerActiveThreadsOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var timeVsThreadsInfos = {
        data: {"result": {"supportsControllersDiscrimination": true, "series": [{"isController": false, "data": [[3.0, 138.25], [6.0, 162.0], [7.0, 168.5], [2.0, 120.5], [1.0, 426.75], [10.0, 169.8823529411765], [4.0, 123.0], [9.0, 161.0], [8.0, 180.83333333333331], [5.0, 203.11111111111111]], "label": "HTTP请求", "isOverall": false}, {"isController": false, "data": [[8.039603960396038, 177.92079207920796]], "label": "HTTP请求-Aggregated", "isOverall": false}], "title": "Time VS Threads", "maxY": 426.75, "maxX": 10.0, "minX": 1.0, "minY": 120.5}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: { noColumns: 2,show: true, container: '#legendTimeVsThreads' },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s: At %x.2 active threads, Average response time was %y.2 ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesTimeVsThreads"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotTimesVsThreads"), dataset, options);
            // setup overview
            $.plot($("#overviewTimesVsThreads"), dataset, prepareOverviewOptions(options));
        }
};

// Time vs threads
function refreshTimeVsThreads(){
    var infos = timeVsThreadsInfos;
    prepareSeries(infos.data);
    if(isGraph($("#flotTimesVsThreads"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTimeVsThreads");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTimesVsThreads", "#overviewTimesVsThreads");
        $('#footerTimeVsThreads .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var bytesThroughputOverTimeInfos = {
        data : {"result": {"supportsControllersDiscrimination": false, "series": [{"isController": false, "data": [[1.48221402E12, 103068.33333333333], [1.48221396E12, 1030.6833333333334]], "label": "Bytes received per second", "isOverall": false}, {"isController": false, "data": [[1.48221402E12, 301.6666666666667], [1.48221396E12, 3.0166666666666666]], "label": "Bytes sent per second", "isOverall": false}], "title": "Bytes Throughput Over Time", "granularity": 60000, "maxY": 103068.33333333333, "maxX": 1.48221402E12, "minX": 1.48221396E12, "minY": 3.0166666666666666}},
        getOptions : function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity) ,
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Bytes/sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendBytesThroughputOverTime'
                },
                selection: {
                    mode: "xy"
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y"
                }
            };
        },
        createGraph : function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesBytesThroughputOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotBytesThroughputOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewBytesThroughputOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Bytes throughput Over Time
function refreshBytesThroughputOverTime(fixTimestamps) {
    var infos = bytesThroughputOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotBytesThroughputOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesBytesThroughputOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotBytesThroughputOverTime", "#overviewBytesThroughputOverTime");
        $('#footerBytesThroughputOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimesOverTimeInfos = {
        data: {"result": {"supportsControllersDiscrimination": true, "series": [{"isController": false, "data": [[1.48221402E12, 178.07999999999996], [1.48221396E12, 162.0]], "label": "HTTP请求", "isOverall": false}], "title": "Response Time Over Time", "granularity": 60000, "maxY": 178.07999999999996, "maxX": 1.48221402E12, "minX": 1.48221396E12, "minY": 162.0}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average response time was %y ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Times Over Time
function refreshResponseTimeOverTime(fixTimestamps) {
    var infos = responseTimesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotResponseTimesOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesOverTime", "#overviewResponseTimesOverTime");
        $('#footerResponseTimesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var latenciesOverTimeInfos = {
        data: {"result": {"supportsControllersDiscrimination": true, "series": [{"isController": false, "data": [[1.48221402E12, 106.06], [1.48221396E12, 154.0]], "label": "HTTP请求", "isOverall": false}], "title": "Latencies Over Time", "granularity": 60000, "maxY": 154.0, "maxX": 1.48221402E12, "minX": 1.48221396E12, "minY": 106.06}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response latencies in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendLatenciesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average latency was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesLatenciesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotLatenciesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewLatenciesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Latencies Over Time
function refreshLatenciesOverTime(fixTimestamps) {
    var infos = latenciesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotLatenciesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesLatenciesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotLatenciesOverTime", "#overviewLatenciesOverTime");
        $('#footerLatenciesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var connectTimeOverTimeInfos = {
        data: {"result": {"supportsControllersDiscrimination": true, "series": [{"isController": false, "data": [[1.48221402E12, 1.3800000000000008], [1.48221396E12, 53.0]], "label": "HTTP请求", "isOverall": false}], "title": "Connect Time Over Time", "granularity": 60000, "maxY": 53.0, "maxX": 1.48221402E12, "minX": 1.48221396E12, "minY": 1.3800000000000008}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getConnectTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average Connect Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendConnectTimeOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average connect time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesConnectTimeOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotConnectTimeOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewConnectTimeOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Connect Time Over Time
function refreshConnectTimeOverTime(fixTimestamps) {
    var infos = connectTimeOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotConnectTimeOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesConnectTimeOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotConnectTimeOverTime", "#overviewConnectTimeOverTime");
        $('#footerConnectTimeOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var responseTimePercentilesOverTimeInfos = {
        data: {"result": {"supportsControllersDiscrimination": false, "series": [{"isController": false, "data": [[1.48221402E12, 98.0], [1.48221396E12, 162.0]], "label": "Min", "isOverall": false}, {"isController": false, "data": [[1.48221402E12, 1295.0], [1.48221396E12, 162.0]], "label": "Max", "isOverall": false}, {"isController": false, "data": [[1.48221402E12, 346.9999999999993], [1.48221396E12, 162.0]], "label": "95th percentile", "isOverall": false}, {"isController": false, "data": [[1.48221402E12, 1290.5400000000009], [1.48221396E12, 162.0]], "label": "99th percentile", "isOverall": false}, {"isController": false, "data": [[1.48221402E12, 216.39999999999998], [1.48221396E12, 162.0]], "label": "90th percentile", "isOverall": false}], "title": "Response Time Percentiles Over Time (successful requests only)", "granularity": 60000, "maxY": 1295.0, "maxX": 1.48221402E12, "minX": 1.48221396E12, "minY": 98.0}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentilesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Response time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentilesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimePercentilesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimePercentilesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Time Percentiles Over Time
function refreshResponseTimePercentilesOverTime(fixTimestamps) {
    var infos = responseTimePercentilesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotResponseTimePercentilesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimePercentilesOverTime", "#overviewResponseTimePercentilesOverTime");
        $('#footerResponseTimePercentilesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var responseTimeVsRequestInfos = {
    data: {"result": {"supportsControllersDiscrimination": false, "series": [{"isController": false, "data": [[1.0, 162.0], [100.0, 146.0]], "label": "Successes", "isOverall": false}], "title": "Response Time Vs Request", "granularity": 60000, "maxY": 162.0, "maxX": 100.0, "minX": 1.0, "minY": 146.0}},
    getOptions: function() {
        return {
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Response Time (ms)",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: {
                noColumns: 2,
                show: true,
                container: '#legendResponseTimeVsRequest'
            },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesResponseTimeVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotResponseTimeVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewResponseTimeVsRequest"), dataset, prepareOverviewOptions(options));

    }
};

// Response Time vs Request
function refreshResponseTimeVsRequest() {
    var infos = responseTimeVsRequestInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeVsRequest"))){
        infos.create();
    }else{
        var choiceContainer = $("#choicesResponseTimeVsRequest");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimeVsRequest", "#overviewResponseTimeVsRequest");
        $('#footerResponseRimeVsRequest .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var latenciesVsRequestInfos = {
    data: {"result": {"supportsControllersDiscrimination": false, "series": [{"isController": false, "data": [[1.0, 154.0], [100.0, 96.0]], "label": "Successes", "isOverall": false}], "title": "Latencies Vs Request", "granularity": 60000, "maxY": 154.0, "maxX": 100.0, "minX": 1.0, "minY": 96.0}},
    getOptions: function() {
        return{
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Latency (ms)",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: { noColumns: 2,show: true, container: '#legendLatencyVsRequest' },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesLatencyVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotLatenciesVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewLatenciesVsRequest"), dataset, prepareOverviewOptions(options));
    }
};

// Latencies vs Request
function refreshLatenciesVsRequest() {
        var infos = latenciesVsRequestInfos;
        prepareSeries(infos.data);
        if(isGraph($("#flotLatenciesVsRequest"))){
            infos.createGraph();
        }else{
            var choiceContainer = $("#choicesLatencyVsRequest");
            createLegend(choiceContainer, infos);
            infos.createGraph();
            setGraphZoomable("#flotLatenciesVsRequest", "#overviewLatenciesVsRequest");
            $('#footerLatenciesVsRequest .legendColorBox > div').each(function(i){
                $(this).clone().prependTo(choiceContainer.find("li").eq(i));
            });
        }
};

var hitsPerSecondInfos = {
        data: {"result": {"supportsControllersDiscrimination": false, "series": [{"isController": false, "data": [[1.48221402E12, 1.6666666666666667], [1.48221396E12, 0.016666666666666666]], "label": "hitsPerSecond", "isOverall": false}], "title": "Hits Per Second", "granularity": 60000, "maxY": 1.6666666666666667, "maxX": 1.48221402E12, "minX": 1.48221396E12, "minY": 0.016666666666666666}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of hits / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendHitsPerSecond"
                },
                selection: {
                    mode : 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y.2 hits/sec"
                }
            };
        },
        createGraph: function createGraph() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesHitsPerSecond"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotHitsPerSecond"), dataset, options);
            // setup overview
            $.plot($("#overviewHitsPerSecond"), dataset, prepareOverviewOptions(options));
        }
};

// Hits per second
function refreshHitsPerSecond(fixTimestamps) {
    var infos = hitsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if (isGraph($("#flotHitsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesHitsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotHitsPerSecond", "#overviewHitsPerSecond");
        $('#footerHitsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var codesPerSecondInfos = {
        data: {"result": {"supportsControllersDiscrimination": false, "series": [{"isController": false, "data": [[1.48221402E12, 1.6666666666666667], [1.48221396E12, 0.016666666666666666]], "label": "200", "isOverall": false}], "title": "Codes Per Second", "granularity": 60000, "maxY": 1.6666666666666667, "maxX": 1.48221402E12, "minX": 1.48221396E12, "minY": 0.016666666666666666}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses/sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendCodesPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "Number of Response Codes %s at %x was %y.2 responses / sec"
                }
            };
        },
    createGraph: function() {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesCodesPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotCodesPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewCodesPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Codes per second
function refreshCodesPerSecond(fixTimestamps) {
    var infos = codesPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotCodesPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesCodesPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotCodesPerSecond", "#overviewCodesPerSecond");
        $('#footerCodesPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var transactionsPerSecondInfos = {
        data: {"result": {"supportsControllersDiscrimination": true, "series": [{"isController": false, "data": [[1.48221402E12, 1.6666666666666667], [1.48221396E12, 0.016666666666666666]], "label": "HTTP请求-success", "isOverall": false}], "title": "Transactions Per Second", "granularity": 60000, "maxY": 1.6666666666666667, "maxX": 1.48221402E12, "minX": 1.48221396E12, "minY": 0.016666666666666666}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of transactions / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendTransactionsPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y transactions / sec"
                }
            };
        },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesTransactionsPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotTransactionsPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewTransactionsPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Transactions per second
function refreshTransactionsPerSecond(fixTimestamps) {
    var infos = transactionsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotTransactionsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTransactionsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTransactionsPerSecond", "#overviewTransactionsPerSecond");
        $('#footerTransactionsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

// Collapse the graph matching the specified DOM element depending the collapsed
// status
function collapse(elem, collapsed){
    if(collapsed){
        $(elem).parent().find(".fa-chevron-up").removeClass("fa-chevron-up").addClass("fa-chevron-down");
    } else {
        $(elem).parent().find(".fa-chevron-down").removeClass("fa-chevron-down").addClass("fa-chevron-up");
        if (elem.id == "bodyBytesThroughputOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshBytesThroughputOverTime(true);
            }
            document.location.href="#bytesThroughputOverTime";
        } else if (elem.id == "bodyLatenciesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesOverTime(true);
            }
            document.location.href="#latenciesOverTime";
        } else if (elem.id == "bodyConnectTimeOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshConnectTimeOverTime(true);
            }
            document.location.href="#connectTimeOverTime";
        } else if (elem.id == "bodyResponseTimePercentilesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimePercentilesOverTime(true);
            }
            document.location.href="#responseTimePercentilesOverTime";
        } else if (elem.id == "bodyResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeDistribution();
            }
            document.location.href="#responseTimeDistribution" ;
        } else if (elem.id == "bodySyntheticResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshSyntheticResponseTimeDistribution();
            }
            document.location.href="#syntheticResponseTimeDistribution" ;
        } else if (elem.id == "bodyActiveThreadsOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshActiveThreadsOverTime(true);
            }
            document.location.href="#activeThreadsOverTime";
        } else if (elem.id == "bodyTimeVsThreads") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTimeVsThreads();
            }
            document.location.href="#timeVsThreads" ;
        } else if (elem.id == "bodyCodesPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshCodesPerSecond(true);
            }
            document.location.href="#codesPerSecond";
        } else if (elem.id == "bodyTransactionsPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTransactionsPerSecond(true);
            }
            document.location.href="#transactionsPerSecond";
        } else if (elem.id == "bodyResponseTimeVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeVsRequest();
            }
            document.location.href="#responseTimeVsRequest";
        } else if (elem.id == "bodyLatenciesVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesVsRequest();
            }
            document.location.href="#latencyVsRequest";
        }
    }
}

// Collapse
$(function() {
        $('.collapse').on('shown.bs.collapse', function(){
            collapse(this, false);
        }).on('hidden.bs.collapse', function(){
            collapse(this, true);
        });
});

$(function() {
    $(".glyphicon").mousedown( function(event){
        var tmp = $('.in:not(ul)');
        tmp.parent().parent().parent().find(".fa-chevron-up").removeClass("fa-chevron-down").addClass("fa-chevron-down");
        tmp.removeClass("in");
        tmp.addClass("out");
    });
});

/*
 * Activates or deactivates all series of the specified graph (represented by id parameter)
 * depending on checked argument.
 */
function toggleAll(id, checked){
    var placeholder = document.getElementById(id);

    var cases = $(placeholder).find(':checkbox');
    cases.prop('checked', checked);
    $(cases).parent().children().children().toggleClass("legend-disabled", !checked);

    var choiceContainer;
    if ( id == "choicesBytesThroughputOverTime"){
        choiceContainer = $("#choicesBytesThroughputOverTime");
        refreshBytesThroughputOverTime(false);
    } else if(id == "choicesResponseTimesOverTime"){
        choiceContainer = $("#choicesResponseTimesOverTime");
        refreshResponseTimeOverTime(false);
    } else if ( id == "choicesLatenciesOverTime"){
        choiceContainer = $("#choicesLatenciesOverTime");
        refreshLatenciesOverTime(false);
    } else if ( id == "choicesConnectTimeOverTime"){
        choiceContainer = $("#choicesConnectTimeOverTime");
        refreshConnectTimeOverTime(false);
    } else if ( id == "responseTimePercentilesOverTime"){
        choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        refreshResponseTimePercentilesOverTime(false);
    } else if ( id == "choicesResponseTimePercentiles"){
        choiceContainer = $("#choicesResponseTimePercentiles");
        refreshResponseTimePercentiles();
    } else if(id == "choicesActiveThreadsOverTime"){
        choiceContainer = $("#choicesActiveThreadsOverTime");
        refreshActiveThreadsOverTime(false);
    } else if ( id == "choicesTimeVsThreads"){
        choiceContainer = $("#choicesTimeVsThreads");
        refreshTimeVsThreads();
    } else if ( id == "choicesSyntheticResponseTimeDistribution"){
        choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        refreshSyntheticResponseTimeDistribution();
    } else if ( id == "choicesResponseTimeDistribution"){
        choiceContainer = $("#choicesResponseTimeDistribution");
        refreshResponseTimeDistribution();
    } else if ( id == "choicesHitsPerSecond"){
        choiceContainer = $("#choicesHitsPerSecond");
        refreshHitsPerSecond(false);
    } else if(id == "choicesCodesPerSecond"){
        choiceContainer = $("#choicesCodesPerSecond");
        refreshCodesPerSecond(false);
    } else if ( id == "choicesTransactionsPerSecond"){
        choiceContainer = $("#choicesTransactionsPerSecond");
        refreshTransactionsPerSecond(false);
    } else if ( id == "choicesResponseTimeVsRequest"){
        choiceContainer = $("#choicesResponseTimeVsRequest");
        refreshResponseTimeVsRequest();
    } else if ( id == "choicesLatencyVsRequest"){
        choiceContainer = $("#choicesLatencyVsRequest");
        refreshLatenciesVsRequest();
    }
    var color = checked ? "black" : "#818181";
    choiceContainer.find("label").each(function(){
        this.style.color = color;
    });
}

// Unchecks all boxes for "Hide all samples" functionality
function uncheckAll(id){
    toggleAll(id, false);
}

// Checks all boxes for "Show all samples" functionality
function checkAll(id){
    toggleAll(id, true);
}

// Prepares data to be consumed by plot plugins
function prepareData(series, choiceContainer, customizeSeries){
    var datasets = [];

    // Add only selected series to the data set
    choiceContainer.find("input:checked").each(function (index, item) {
        var key = $(item).attr("name");
        var i = 0;
        var size = series.length;
        while(i < size && series[i].label != key)
            i++;
        if(i < size){
            var currentSeries = series[i];
            datasets.push(currentSeries);
            if(customizeSeries)
                customizeSeries(currentSeries);
        }
    });
    return datasets;
}

/*
 * Ignore case comparator
 */
function sortAlphaCaseless(a,b){
    return a.toLowerCase() > b.toLowerCase() ? 1 : -1;
};

/*
 * Creates a legend in the specified element with graph information
 */
function createLegend(choiceContainer, infos) {
    // Sort series by name
    var keys = [];
    $.each(infos.data.result.series, function(index, series){
        keys.push(series.label);
    });
    keys.sort(sortAlphaCaseless);

    // Create list of series with support of activation/deactivation
    $.each(keys, function(index, key) {
        var id = choiceContainer.attr('id') + index;
        $('<li />')
            .append($('<input id="' + id + '" name="' + key + '" type="checkbox" checked="checked" hidden />'))
            .append($('<label />', { 'text': key , 'for': id }))
            .appendTo(choiceContainer);
    });
    choiceContainer.find("label").click( function(){
        if (this.style.color !== "rgb(129, 129, 129)" ){
            this.style.color="#818181";
        }else {
            this.style.color="black";
        }
        $(this).parent().children().children().toggleClass("legend-disabled");
    });
    choiceContainer.find("label").mousedown( function(event){
        event.preventDefault();
    });
    choiceContainer.find("label").mouseenter(function(){
        this.style.cursor="pointer";
    });

    // Recreate graphe on series activation toggle
    choiceContainer.find("input").click(function(){
        infos.createGraph();
    });
}
