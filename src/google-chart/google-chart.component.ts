declare var google: any;

import {
  Component,
  ElementRef,
  ChangeDetectionStrategy,
  OnChanges,
  Input,
  Output,
  SimpleChanges,
  EventEmitter
} from '@angular/core';

import { GoogleChartsLoaderService } from '../google-charts-loader.service';
import { ChartReadyEvent } from './chart-ready-event';
import { ChartErrorEvent } from './chart-error-event';
import { ChartSelectEvent } from './chart-select-event';
import { DataPointHoveredEvent , BoundingBox , DataPointPosition }  from './datapoint-hovered-event';
import { ChartHTMLTooltip }  from './chart-html-tooltip';

@Component({
  selector: 'google-chart',
  template: '<div></div>',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GoogleChartComponent implements OnChanges {

  @Input() public data: any;

  @Output() public chartReady: EventEmitter<ChartReadyEvent>;

  @Output() public chartError: EventEmitter<ChartErrorEvent>;

  @Output() public chartSelect: EventEmitter<ChartSelectEvent>;

  @Output() public onMouseOver:  EventEmitter<DataPointHoveredEvent>;

  private wrapper: any;
  private cli: any;
  private options: any;

  private el: ElementRef;
  private loaderService: GoogleChartsLoaderService;
  private eventsLoaded: boolean;

  public constructor(el: ElementRef,
                     loaderService: GoogleChartsLoaderService) {
    this.el = el;
    this.loaderService = loaderService;
    this.chartSelect = new EventEmitter();
    this.chartReady = new EventEmitter();
    this.chartError = new EventEmitter();
    this.onMouseOver = new EventEmitter();
    this.eventsLoaded = false;
  }

  public ngOnChanges(changes: SimpleChanges):void {
    let key = 'data';
    if (changes[key]) {

      if(!this.data) {
        return;
      }

      this.options = this.data.options;

      this.loaderService.load(this.data.chartType).then(() => {
        if(this.wrapper === undefined) {
          this.wrapper = new google.visualization.ChartWrapper(this.data);
        } else {
          this.unregisterChartEvents();
          this.wrapper.setDataTable(this.data.dataTable);
          this.wrapper.setOptions(this.options);
        }
        if (!this.eventsLoaded) {
          this.registerChartWrapperEvents();
          this.eventsLoaded = true;
        }
        this.wrapper.draw(this.el.nativeElement.querySelector('div'));
      });
    }
  }

  private getSelectorBySeriesType(seriesType: string): string {
    let selectors: any = {
      bars : 'bar#%s#%r',
      haxis : 'hAxis#0#label',
      line: 'point#%s#%r',
      legend : 'legendentry#%s'
    };

    let selector: string = selectors[seriesType];

    return selector;
  }

 /**
  * Given a column number, counts how many
  * columns have rol=="data". Those are mapped
  * one-to-one to the series array. When rol is not defined
  * a column of type number means a series column.
  * @param column to inspect
  */
  private getSeriesByColumn(column:number): number  {
    let series: number = 0;
    let dataTable = this.wrapper.getDataTable();
    for(let i=column-1; i>=0; i--) {
      let role = dataTable.getColumnRole(i);
      let type = dataTable.getColumnType(i);
      if(role === 'data' || type === 'number' ) {
        series++;
      }
    }
    return series;
  }

  private getBoundingBoxForItem(item: DataPointPosition): BoundingBox {
    let boundingBox = {top : 0, left:0, width:0, height:0};
    if(this.cli) {
      let column = item.column;
      let series = this.getSeriesByColumn(column);
      let bar = item.row;
      let row = item.row;

      if(this.options.series && this.options.series[series] && (this.options.series[series].type || this.options.seriesType) ) {
        let seriesType = this.options.series[series].type || this.options.seriesType;
        let selector = this.getSelectorBySeriesType(seriesType);
        if(selector) {
             selector = selector.replace('%s',series + '').replace('%c',column+'').replace('%r',row+'');
             let box = this.cli.getBoundingBox(selector);
             if(box) {
              boundingBox = box;
             }
        }
      }
    }

    return boundingBox;
  }

  private getDataValueAtPosition(position: DataPointPosition):any {
    return {};
  }

  private getDataTypeAtPosition(position: DataPointPosition):string {
    return '';
  }

  private getHTMLTooltip(): ChartHTMLTooltip {
    let tooltipER = new ElementRef(this.el.nativeElement.querySelector('.google-visualization-tooltip'));
    return new ChartHTMLTooltip(tooltipER);
  }

  private parseDataPointHoveredEvent(item: DataPointPosition): DataPointHoveredEvent {
        let event = {
          hoveredItemPosition: item,
          hoveredItemBoundingBox: this.getBoundingBoxForItem(item),
          hoveredItemValue: this.getDataValueAtPosition(item),
          tooltip: this.getHTMLTooltip(),
          hoveredItemType: this.getDataTypeAtPosition(item)
        };
        return event;
  }

  private unregisterChartEvents():void {
    let chart = this.wrapper.getChart();
    google.visualization.events.removeAllListeners(chart);
  }

  private registerChartEvents(): void {
    if(this.onMouseOver.observers.length > 0 ) {
      let chart = this.wrapper.getChart();
      this.cli = chart.getChartLayoutInterface();
      google.visualization.events.addListener(chart, 'onmouseover', (item: DataPointPosition) => {
        let event = this.parseDataPointHoveredEvent(item);
        this.onMouseOver.emit(event);
      });
    }
  }

  private registerChartWrapperEvents(): void {

    google.visualization.events.addListener(this.wrapper, 'ready', () => {
      this.chartReady.emit({message: 'Chart ready'});
      this.registerChartEvents();
    });

    google.visualization.events.addListener(this.wrapper, 'error', (error: any) => {
      this.chartError.emit(error as ChartErrorEvent);
    });

    google.visualization.events.addListener(this.wrapper, 'select', () => {
      let event: ChartSelectEvent;
      let selection: {row: number; column: number} = this.wrapper.visualization.getSelection()[0];

      if (selection !== undefined) {
        let selectedRowValues = [];

        if (selection.row !== null) {
          let dataTable = this.wrapper.getDataTable();
          let numberOfColumns = dataTable.getNumberOfColumns();
          for (let i = 0; i < numberOfColumns; i++) {
            selectedRowValues.push(dataTable.getValue(selection.row, i));
          }
        }

        event = {
          message: 'select',
          row: selection.row,
          column: selection.column,
          ['selectedRowValues']: selectedRowValues
        };
      } else {
        event = {
          message: 'deselect',
          row: null,
          column: null,
          selectedRowValues: []
        };
      }

      this.chartSelect.emit(event);
    });
  }

}
