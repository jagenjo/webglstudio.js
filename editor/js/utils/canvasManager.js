/* Mini canvas wrapper for some lightgl common actions
	- organizes different widgets accesing the 3d context (input and rendering)
	- some debug utilities
	- super and subsampling

	Dependencies: 
		litegl
		Shaders
*/

function CanvasManager( container, options)
{
	this.widgets = [];
	this.keys = {};

	this.root = new CanvasElement();
	this.root.use_normalized_viewport = 1;
	this.root.size = [1,1];

	this.init( container, options )
}

CanvasManager.prototype.init = function( options )
{
	options = options || {};

	var container = options.container || "body";

	if(container.constructor === String)
	{
		container = document.querySelector( container );
		if(!container)
			return false;
	}

	if( options.full )
	{
		options.width = container.offsetWidth; //$(container).width();
		options.height = container.offsetHeight;// $(container).height();
	}

	options.width = options.width || 500;
	options.height = options.height || 500;

	var antialiasing = true;
	if(options.antialiasing != null)
		antialiasing = options.antialiasing;

	//setting this var to true will make the render slower but allow to call toDataURL
	var allow_read = false;

	//create canvas and attach events
	try
	{
		window.gl = GL.create({ antialias: antialiasing, alpha:false, premultipliedAlpha: false, debug: true, preserveDrawingBuffer: allow_read });
	}
	catch (err)
	{
		console.error("WebGL not supported");
		return false;
	}

	if(options.subsampling && options.subsampling != 1 )
	{
		gl.canvas.width = options.width / options.subsampling;
		gl.canvas.height = options.height / options.subsampling;
		gl.canvas.style.width = options.width.toFixed() + "px";
		gl.canvas.style.height = options.height.toFixed() + "px";
	}
	else
	{
		gl.canvas.width = options.width;
		gl.canvas.height = options.height;
	}

	var that = this;

	gl.ondraw = this.ondraw.bind(this);
	gl.onupdate = this.onupdate.bind(this);

	gl.captureMouse(true);
	gl.captureKeys();

	gl.onmousedown = gl.onmousemove = gl.onmouseup = gl.onkeydown = gl.onkeyup = gl.onmousewheel = this.dispatchEvent.bind(this);

	gl.viewport(0,0,gl.canvas.width, gl.canvas.height);
	gl.enable( gl.CULL_FACE );
	gl.enable( gl.DEPTH_TEST );

	//attach
	container.appendChild( gl.canvas );

	//window.addEventListener("resize", this.onCheckSize.bind(this), true ); //dont work :(
	$(window).resize( this.onCheckSize.bind(this) );

	//this.timer = setInterval( this.onCheckSize.bind(this), 100 );
	this.canvas = gl.canvas;
	this.gl = gl;
	gl.animate();
};

CanvasManager.prototype.onCheckSize = function()
{
	//console.log("resize!");
	this.resize();
}

CanvasManager.prototype.resize = function(w,h)
{
	if(!this.gl || !this.gl.canvas)
		return;

	var parent = this.gl.canvas.parentNode;
	w = w || $(parent).width();
	h = h || $(parent).height();

	if(w == 0 || h == 0) return;
	if(w == this.gl.canvas.width && h == this.gl.canvas.height)
		return;

	this.gl.canvas.width = w;
	this.gl.canvas.height = h;
	this.gl.viewport(0,0,w,h);
}

CanvasManager.prototype.enable = function()
{
	window.gl = this.gl;
}

CanvasManager.prototype.addWidget = function(widget, index)
{
	if(index === undefined)
		this.widgets.push(widget);
	else
		this.widgets.splice(index,0,widget);
},

CanvasManager.prototype.removeWidget = function(widget)
{
	var pos = this.widgets.indexOf(widget);
	if(pos != -1)
		this.widgets.splice(pos,1);
},

//Be careful, events are processed from end to start, so lower order means later
CanvasManager.prototype.setWidgetOrder = function(widget, order)
{
	var pos = this.widgets.indexOf(widget);
	if(pos == order)
		return;

	this.widgets.splice(pos,1); //remove
	if(order < 0)
		this.widgets.splice(0,0,widget);
	else if(order >= this.widgets.length)
		this.widgets.push(widget);
	else
		this.widgets.splice(order,0,widget);
},


CanvasManager.prototype.ondraw = function()
{
	for(var i = 0; i < this.widgets.length; ++i)
	{
		if(this.widgets[i].render)
			if(this.widgets[i].render(gl) == true)
				break;
	}

	//assign
	gl.start2D();
	CanvasElement.reset( gl.viewport_data );
	this.root.render( gl );
	gl.finish2D();
},

CanvasManager.prototype.onupdate = function(seconds)
{
	for(var i = 0; i < this.widgets.length; ++i)
	{
		if(this.widgets[i].update)
			this.widgets[i].update(seconds);
	}

	this.root.update( seconds );
}

//input ******************

CanvasManager.prototype.dispatchEvent = function(e)
{
	var event_name = e.eventType;

	if(event_name == "mousedown")
	{
		LiteGUI.focus_widget = this.canvas;
		var elem = document.activeElement;
		if(elem && elem.blur)
			elem.blur();
	}

	/*
	if(event_name == "keydown")
	{
		if(	LiteGUI.focus_widget )
			LiteGUI.focus_widget.dispatchEvent( e );
		if(e.defaultPrevented)
			return;
	}
	*/


	//start width widgets
	if( this.root.processEvent(e) === true )
		return;

	//back to front
	for(var i = this.widgets.length-1;i >= 0; i--)
	{
		if(this.widgets[i].onevent)
			if(this.widgets[i].onevent(e) === true)
				break;

		if(this.widgets[i][event_name])
			if(this.widgets[i][event_name].call(this.widgets[i],e) === true)
				break;
	}
}

