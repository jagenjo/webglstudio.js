function ProfilingPanelWidget( options )
{
	options = options || {};

	var that = this;

	this.enabled = true;
	this.refresh_time = 250;

	this.max_samples = 100;
	this.last_fps = 0;
	this.last_time = 0;
	this.frames = 0;	
	this.buffer = [];



	this.root = document.createElement("div");
	this.root.className = "profiling-panel";
	this.root.panel = this; //link
	this.root.style.width = "100%";
	this.root.style.height = "100%";

	if(options.id)
		this.root.id = options.id;

	var canvas_height = options.canvas_height || 150;

	var area = this.area = new LiteGUI.Area();
	area.split("vertical",[canvas_height,null]);
	this.root.appendChild( area.root );

	//create
	this.canvas = createCanvas(100,canvas_height);
	this.area.getSection(0).add( this.canvas );
	this.render();

	//panel
	this.panel = new LiteGUI.Panel({title:"Profile info"});
	this.area.getSection(1).add( this.panel );

	//table
	this.table = new LiteGUI.Table({width:400, scrollable:true, columns:[{name:"Parameter",width:200},"Value"]});
	this.table.addRow(["Frame CPU Time","---"]);
	this.table.addRow(["Rendered Instances","---"]);
	this.table.addRow(["Draw Calls","---"]);
	this.table.addRow(["Total RenderInstances","---"]);
	this.table.addRow(["SceneNodes","---"]);
	this.table.addRow(["Lights","---"]);
	this.table.addRow(["Render passes","---"]);
	this.panel.add( this.table );

	this.root.addEventListener("DOMNodeInsertedIntoDocument", function(){ 
		that.bindEvents(); 
	});
	this.root.addEventListener("DOMNodeRemovedFromDocument", function(){ 
		that.unbindEvents();
	});
}

ProfilingPanelWidget.widget_name = "Profiling";

ProfilingPanelWidget.prototype.render = function()
{
	var rect = LiteGUI.getRect( this.canvas.parentNode );
	var w = rect ? rect.width : 100;
	this.canvas.width = w;

	//adjust
	this.max_samples = w - 20; //20 pixels margin
	if(this.buffer.length > this.max_samples)
		this.buffer.splice(0, this.buffer.length - this.max_samples	);

	var ctx = this.canvas.getContext("2d");
	ctx.fillStyle = "#111";
	ctx.fillRect(0,0,this.canvas.width,this.canvas.height);

	ctx.fillStyle = "#AAA";
	ctx.fillRect(0,0,this.canvas.width,1);

	//render profiling info...
	this.updateGraph();

	return true;
}

ProfilingPanelWidget.prototype.bindEvents = function()
{
	LEvent.bind( LS.GlobalScene,"afterRender", this.onFrame, this );
}

ProfilingPanelWidget.prototype.unbindEvents = function()
{
	LEvent.unbind( LS.GlobalScene,"afterRender", this.onFrame, this );
}

ProfilingPanelWidget.prototype.onFrame = function()
{
	if(!this.enabled)
		return;

	var now = getTime();
	var elapsed = now - this.last_time;

	this.frames++;

	if(elapsed > this.refresh_time)
	{
		this.last_fps = this.frames;
		this.buffer.push( this.last_fps * (1000 / this.refresh_time) );
		this.frames = 0;
		if( this.buffer.length > this.max_samples )
			this.buffer.shift();
		this.last_time = now;
		this.updateGraph();
	}

	this.updateTable();
}

ProfilingPanelWidget.prototype.updateTable = function()
{
	if(!this.table)
		return;

	this.table.updateCell( 0, 1, (LS.Renderer._frame_cpu_time).toFixed(2) + "ms" );
	this.table.updateCell( 1, 1, LS.Renderer._rendered_instances );
	this.table.updateCell( 2, 1, LS.Renderer._rendercalls );
	this.table.updateCell( 3, 1, LS.GlobalScene._instances.length );
	this.table.updateCell( 4, 1, LS.GlobalScene._nodes.length );
	this.table.updateCell( 5, 1, LS.GlobalScene._lights.length );
	this.table.updateCell( 6, 1, LS.Renderer._rendered_passes );
}

ProfilingPanelWidget.prototype.updateGraph = function()
{
	if(!this.canvas)
		return;

	var ctx = this.canvas.getContext("2d");
	ctx.clearRect(0,0,this.canvas.width, this.canvas.height );
	ctx.fillStyle = "rgba(0,0,0,0.5)";
	ctx.fillRect(0,0,this.canvas.width, this.canvas.height );
	if(!this.buffer.length)
		return;

	ctx.lineWidth = 1;

	ctx.strokeStyle = "rgba(255,255,255,0.4)";
	ctx.beginPath();
	ctx.moveTo(10.5, 10.5 );
	ctx.lineTo(this.canvas.width - 20.5, 10.5 );
	ctx.moveTo(10.5, this.canvas.height - 10.5 );
	ctx.lineTo(this.canvas.width - 20.5, this.canvas.height - 10.5 );
	ctx.stroke();

	for(var i = 0; i < this.buffer.length; i++)
	{
		var v = this.buffer[i];
		ctx.strokeStyle = v > 50 ? "#8F8" : ( v > 30 ? "#AD5" : (v > 20 ? "orange" : "red") );
		ctx.beginPath();
		ctx.moveTo(i + 10.5, this.canvas.height - 10.5 );
		ctx.lineTo(i + 10.5, this.canvas.height - 10.5 - Math.round(v) );
		ctx.stroke();
	}

	ctx.fillStyle = "white";
	ctx.strokeStyle = "black";
	ctx.font = "18px Arial";
	ctx.lineWidth = 2;
	ctx.strokeText( this.last_fps * (1000 / this.refresh_time), 20, 40 );
	ctx.fillText( this.last_fps * (1000 / this.refresh_time), 20, 40 );
}

ProfilingPanelWidget.prototype.onResize = function()
{
	this.render();
}

CORE.registerWidget( ProfilingPanelWidget );
