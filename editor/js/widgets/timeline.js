function Timeline()
{
	this.canvas_info = {
		timeline_height: 30,
		row_height: 20
	};

	this.mode = "keyframes";
	this.preview = false;
	this.paths_widget = false;

	this.current_take = null;

	this._timeline_data = {};

	this.framerate = LS.Animation.Track.FRAMERATE;

	this.createInterface();
	//this.onNewAnimation();
}

Timeline.DEFAULT_DURATION = 20; //in seconds

Timeline.prototype.createInterface = function()
{
	var that = this;

	this.root = document.createElement("div");
	this.root.className = "timeline";

	//add tool bar
	var widgets = this.top_widgets = new LiteGUI.Inspector( null, { height: 30, widgets_width: 140, name_width: 60, one_line: true } );
	this.root.appendChild( widgets.root );

	widgets.addButtons(null,["New","Load"], function(v) { 
		if(v == "New")
		{
			that.showNewAnimationDialog();
			//that.onNewAnimation();
		}
		else if(v == "Load")
			that.onLoadAnimation();
	});
	var that = this;
	this.animation_widget = widgets.addString(null, "", { disabled: true } );
	this.duration_widget = widgets.addNumber("Duration", 0, { units:"s", precission:2, callback: function(v){ that.setDuration(v); } } );
	this.current_time_widget = widgets.addNumber("Current", this.session ? this.session.current_time : 0, { units:"s", precission:2, callback: function(v){ that.setCurrentTime(v); } } );
	//widgets.addCheckbox("Preview", this.preview, { callback: function(v){ that.preview = v; } } );
	//this.play_widget = widgets.addCheckbox("Play", !!this.playing, { callback: function(v){ that.playing = !that.playing ; } } );
	widgets.addIcon(null, !!this.preview, { image: "imgs/icons-timeline.png", index: 6,  callback: function(v){ that.preview = !that.preview ; } } );
	this.play_widget = widgets.addIcon(null, !!this.playing, { image: "imgs/icons-timeline.png",  callback: function(v){ that.playing = !that.playing ; } } );
	//this.paths_widget = widgets.addCheckbox("Show Paths", !!this.show_paths, { callback: function(v){ that.show_paths = !that.show_paths ; } } );
	//widgets.addCheckbox("Curves", this.mode == "curves", { callback: function(v){ that.mode = v ? "curves" : "keyframes"; that.redrawCanvas(); } } );

	this.property_widget = widgets.addString("Property", "", { disabled: true, callback: function(v){ } } );
	this.property_widget.style.marginLeft = "10px";
	this.interpolation_widget = widgets.addCombo("Interpolation", "none", { values: {"none": LS.NONE, "linear": LS.LINEAR, "bezier": LS.BEZIER }, callback: function(v){ 
		if( !that.current_track)
			return;
		that.current_track.interpolation = v;
	}});

	//work area
	var area = new LiteGUI.Area(null,{ height: "calc( 100% - 34px )", autoresize: true, inmediateResize: true });
	//area.split("horizontal",[200,null], true);
	this.root.appendChild( area.root );

	//canvas
	this.canvas = document.createElement("canvas");
	this.canvas.addEventListener("mousedown", this.onMouse.bind(this) );
	this.canvas.addEventListener("mousemove", this.onMouse.bind(this) );
	this.canvas.addEventListener("mousewheel", this.onMouseWheel.bind(this), false );
	this.canvas.addEventListener("wheel", this.onMouseWheel.bind(this), false );
	this.canvas.addEventListener("contextmenu", (function(e) { 
		if(e.button != 2) //right button
			return false;
		this.onContextMenu(e);
		e.preventDefault(); 
		return false;
	}).bind(this));

	//this.canvas.addEventListener("keydown", this.onKeyDown.bind(this), true );

	var curves_zone = area.content;
	curves_zone.appendChild( this.canvas );

	var that = this;
	setTimeout( function(){ that.resize(); }, 100 );
}

Timeline.prototype.onNewAnimation = function( name, duration, folder )
{
	name = name || "test";
	duration = duration || Timeline.DEFAULT_DURATION;
	folder = folder || "";

	var animation = new LS.Animation();
	animation.name = name;
	animation.folder = folder;

	var take = animation.createTake( "default", duration );
	this.setAnimation( animation );

	LS.ResourcesManager.registerResource( animation.name, animation );
	this.redrawCanvas();
}

Timeline.prototype.onLoadAnimation = function()
{
	var that = this;
	EditorModule.showSelectResource("animation", inner.bind(this) );

	function inner( name )
	{
		if(!name)
			return;

		var resource = LS.ResourcesManager.getResource( name );
		if(!resource)
		{
			LS.ResourcesManager.load( name, null, function(resource){
				if(resource.constructor === LS.Animation)
					that.setAnimation( resource );
			});
			return;
		}

		if(resource.constructor === LS.Animation)
			this.setAnimation( resource );
		else
			console.warn("Resource must be Animation");
		return;

		LS.ResourcesManager.load( name, function(url, resource) {
			console.log( url, resource );
		});
	}
}

Timeline.prototype.setAnimation = function( animation )
{
	if(this.current_animation == animation)
		return;

	this.session = {
		start_time: 0, //time at left side of window
		current_time: 0,
		seconds_to_pixels: 50, //how many pixels represent one second
		left_margin: 180,
		scroll_y: 0,
		offset_y: 0,
		scale_y: 1, //pixels to units
		selection: null
	};

	this.current_animation = animation;
	this.animation_widget.setValue( animation.name );
	this.current_take = animation.getTake("default");
	this.duration_widget.setValue( this.current_take.duration );

	//update layers

	//update canvas
	this.redrawCanvas();
}

Timeline.prototype.resize = function()
{
	//console.log("timeline resize");
	var canvas = this.canvas;

	var rect = canvas.parentNode.getClientRects()[0];
	if(!rect)
		return;

	canvas.width = rect.width;
	canvas.height = rect.height;

	//twice! (to avoid scrollbar)
	var rect = canvas.parentNode.getClientRects()[0];
	if(!rect)
		return;

	canvas.width = rect.width;
	canvas.height = rect.height;
	this.redrawCanvas();
}

Timeline.prototype.updateTimelineData = function()
{
	var data = this._timeline_data;
	var take = this.current_take;

	data.duration = take.duration;
	data.current_time = Math.clamp( this.session.current_time, 0, data.duration );
	data.current_time = Math.round( data.current_time * this.framerate ) / this.framerate; //quantize

	//show timeline
	data.start_time = Math.floor( this.session.start_time ); //seconds
	if(data.start_time < 0)
		data.start_time = 0;
	data.seconds_to_pixels = this.session.seconds_to_pixels;
	data.pixels_to_seconds = 1 / data.seconds_to_pixels;
	data.end_time = Math.ceil( this.session.start_time + (this.canvas.width - this.session.left_margin) * data.pixels_to_seconds );
	if(data.end_time > data.duration)
		data.end_time = data.duration;
	data.time_range = data.end_time - data.start_time;
	data.tick_time = 1; //how many seconds last every tick (line in timeline)
	data.tick_width = data.tick_time * data.seconds_to_pixels;
	data.startx = Math.round( this.canvasTimeToX( data.start_time ) ) + 0.5;
	data.endx = Math.round( this.canvasTimeToX( data.end_time ) ) + 0.5;

	data.keyframe_time = 1/this.framerate; //how many seconds last every tick (line in timeline)
	data.keyframe_width = data.keyframe_time * data.seconds_to_pixels;
	if(data.keyframe_width < 10)
		data.keyframe_width = 10;

	data.num_tracks = take.tracks.length;
	data.first_track = this.session.scroll_y;
	if(data.first_track < 0)
		data.first_track = 0;
	data.max_tracks = Math.ceil( (this.canvas.height - this.canvas_info.timeline_height) / this.canvas_info.row_height );
	data.last_track = data.first_track + data.max_tracks;
	if(data.last_track > data.num_tracks-1)
		data.last_track = data.num_tracks-1;
	data.total_tracks = data.last_track - data.first_track + 1;
	if(data.total_tracks > data.num_tracks)
		data.total_tracks = data.num_tracks;
}

Timeline.prototype.redrawCanvas = function()
{
	this._must_redraw = false;
	var canvas = this.canvas;
	var ctx = canvas.getContext("2d");
	ctx.fillStyle = "#222";
	ctx.fillRect(0,0, canvas.width, canvas.height );

	if(!this.current_take)
	{
		ctx.font = "50px Arial";
		ctx.textAlign = "center";
		ctx.fillStyle = "#111";
		ctx.fillText("No animation clip", canvas.width * 0.5, canvas.height * 0.5);
		return;
	}

	this.updateTimelineData();

	var take = this.current_take;
	var duration = take.duration;
	var data = this._timeline_data;
	var current_time = data.current_time;

	//show timeline
	var timeline_height = this.canvas_info.timeline_height;
	var margin = this.session.left_margin;

	if(data.seconds_to_pixels > 100 )
	{
		ctx.strokeStyle = "#AAA";
		ctx.globalAlpha = 0.5 * (1.0 - Math.clamp( 100 / data.seconds_to_pixels, 0, 1));
		ctx.beginPath();
		for( var time = data.start_time; time <= data.end_time; time += 1/this.framerate )
		{
			var x = this.canvasTimeToX( time );
			if(x < margin)
				continue;
			ctx.moveTo(Math.round(x) + 0.5, timeline_height * 0.75);
			ctx.lineTo(Math.round(x) + 0.5, timeline_height - 1);
		}
		ctx.stroke();
		ctx.globalAlpha = 1;
	}

	ctx.globalAlpha = 0.5;
	ctx.strokeStyle = "#AFD";
	ctx.beginPath();
	var times = [];
	for( var time = data.start_time; time <= data.end_time; time += data.tick_time )
	{
		var x = this.canvasTimeToX( time );

		if(x < margin)
			continue;

		var is_tick = time % 5 == 0;
		if( is_tick || data.seconds_to_pixels > 70 )
			times.push([x,time]);

		ctx.moveTo(Math.round(x) + 0.5, timeline_height * 0.5 + (is_tick ? 0 : timeline_height * 0.25) );
		ctx.lineTo(Math.round(x) + 0.5, timeline_height);
	}

	var x = data.startx;
	if(x < margin)
		x = margin;
	ctx.moveTo( x, timeline_height - 0.5);
	ctx.lineTo( data.endx, timeline_height - 0.5);
	ctx.stroke();
	ctx.globalAlpha = 1;

	//content
	var line_height = this.canvas_info.row_height;

	//fill track lines
	var w = this.mode == "keyframes" ? canvas.width : this.session.left_margin;
	for(var i = 0; i < data.max_tracks; ++i)
	{
		ctx.fillStyle = i % 2 == 0 ? "#222" : "#2A2A2A";
		//if(this._last_item && (i + this.session.scroll_y) == this._last_item.track)
		if(this.session.selection && this.session.selection.type == "track" && (i + this.session.scroll_y) == this.session.selection.track )
			ctx.fillStyle = "#333";

		ctx.fillRect(0,timeline_height + i * line_height, w, line_height );
	}

	//black bg
	ctx.globalAlpha = 0.2;
	ctx.fillStyle = "black";
	ctx.fillRect( margin, timeline_height, canvas.width - margin, canvas.height - timeline_height );
	ctx.globalAlpha = 1;


	//bg lines
	ctx.strokeStyle = "#444";
	ctx.beginPath();
	ctx.moveTo( margin + 0.5, timeline_height);
	ctx.lineTo( margin + 0.5, canvas.height);

	var pos = this.canvasTimeToX( 0 );
	if(pos < margin)
		pos = margin;
	ctx.moveTo( pos + 0.5, timeline_height);
	ctx.lineTo( pos + 0.5, canvas.height);
	ctx.moveTo( Math.round( this.canvasTimeToX( duration ) ) + 0.5, timeline_height);
	ctx.lineTo( Math.round( this.canvasTimeToX( duration ) ) + 0.5, canvas.height);
	ctx.stroke();

	//timeline texts
	ctx.font = "10px Arial";
	ctx.textAlign = "center";
	ctx.fillStyle = "#888";
	for(var i = 0; i < times.length; ++i)
	{
		var time = times[i][1];
		ctx.fillText( time == (time|0) ? time : time.toFixed(1), times[i][0],10);
	}

	//tracks property info
	ctx.textAlign = "left";

	for(var i = 0; i < data.total_tracks; i++)
	{
		var track = take.tracks[ data.first_track + i ];
		var y = timeline_height + i * line_height;

		//enabler
		ctx.fillStyle = "#666";
		ctx.beginPath();
		ctx.arc( 5.5, y + line_height * 0.5, 4, 0, 2 * Math.PI, false );
		ctx.fill();

		ctx.fillStyle = "#111";
		ctx.fillRect( 14.5, y + 4.5, line_height - 8, line_height - 8 );
		if(track.enabled)
		{
			ctx.fillStyle = "#9AF";
			ctx.fillRect( 16.5, y + 6.5, line_height - 12, line_height - 12 );
		}

		ctx.globalAlpha = track.enabled ? 1 : 0.5;
		ctx.font = "12px Arial";
		ctx.fillStyle = "rgba(255,255,255,0.6)";
		ctx.fillText( track.name , 28.5, Math.floor(y + line_height * 0.8) - 0.5 );
		var info = ctx.measureText( track.name );
		ctx.fillStyle = "rgba(255,255,100,0.4)";
		ctx.fillText( track.type , 32.5 + info.width, Math.floor( y + line_height * 0.8) - 0.5 );
		ctx.fillStyle = "#9AF";
		ctx.globalAlpha = 1;
	}

	if( this.mode == "keyframes" )
	{
		//keyframes
		var keyframe_width = data.keyframe_width;
		var selection = this.session.selection;

		for(var i = 0; i < data.total_tracks; i++)
		{
			var track = take.tracks[ data.first_track + i ];
			var num = track.getNumberOfKeyframes();
			var y = timeline_height + i * line_height;
			ctx.fillStyle = "#9AF";
			ctx.globalAlpha = track.enabled ? 1 : 0.5;

			for(var j = 0; j < num; ++j)
			{
				var keyframe = track.getKeyframe(j);
				if(keyframe[0] < data.start_time || keyframe[0] > data.end_time)
					continue;

				if(selection && selection.type == "keyframe" && selection.track == i && selection.keyframe == j)
					ctx.fillStyle = "#FC6";
				else
					ctx.fillStyle = "#9AF";

				var posx = this.canvasTimeToX( keyframe[0] );

				if(1) //diamonds
				{
					if( (posx + 5) < margin)
						continue;

					ctx.save();
					ctx.translate( posx, y + line_height * 0.5 );
					ctx.beginPath();
					ctx.moveTo(0,5);
					ctx.lineTo(5,0);
					ctx.lineTo(0,-5);
					ctx.lineTo(-5,0);
					ctx.fill();
					ctx.restore();
				}
				else //rectangles
				{
					var w = keyframe_width;
					if( (posx + w) < margin)
						continue;
					if( posx < margin )
					{
						w -= margin - posx;
						posx = margin;
					}
					ctx.fillRect( posx, y + 2, w, line_height - 4);
				}
			}

			ctx.globalAlpha = 1;
		}

	}
	else if( this.mode == "curves" )
	{
		//keyframes
		var keyframe_time = 1/this.framerate; //how many seconds last every tick (line in timeline)
		var keyframe_width = keyframe_time * data.seconds_to_pixels;
		if(keyframe_width < 10)
			keyframe_width = 10;

		for(var i = 0; i < data.total_tracks; i++)
		{
			var track = take.tracks[ data.first_track + i ];
			var num = track.getNumberOfKeyframes();
			var y = timeline_height + i * line_height;
			ctx.fillStyle = ctx.strokeStyle = "#9AF";

			//keyframes
			for(var j = 0; j < num; ++j)
			{
				var keyframe = track.getKeyframe(j);

				var posx = this.canvasTimeToX( keyframe[0] );
				var w = keyframe_width;
				var h = line_height - 4;

				if(track.interpolation == LS.NONE)
				{
					//next
					var keyframe2 = track.getKeyframe(j+1);
					if(keyframe2)
					{
						var posx2 = this.canvasTimeToX( keyframe2[0] );
						w = posx2 - posx;
					}
				}

				if( (posx + w) < margin)
					continue;
				if(posx < margin)
				{
					w -= margin - posx;
					posx = margin;
				}
				ctx.strokeRect( posx + 0.5, y + 2.5, w, h);
			}

			if(track.interpolation == LS.NONE || track.value_size == 0)
				continue;

			//curves
			var num_samples = (data.endx - data.startx) / 10; //every 10 pixels
			var samples = track.getSampledData( data.start_time, data.end_time, num_samples );
			if(!samples)
				continue;

			if(track.value_size == 1)
			{
				ctx.beginPath();
				ctx.moveTo( data.startx, samples[0] );
				for(var k = 0; k < samples.length; ++k)
					ctx.lineTo( data.startx + k * 10, samples[k] );
				ctx.stroke();
			}
			else
			{
				for(var j = 0; j < track.value_size; ++j)
				{
					ctx.beginPath();
					ctx.moveTo( data.startx, samples[0][j] );
					for(var k = 0; k < samples.length; ++k)
						ctx.lineTo( data.startx + k * 10, samples[k][j] );
					ctx.stroke();
				}
			}
		}
	}

	//time marker line
	var pos = Math.round( this.canvasTimeToX( current_time ) ) + 0.5;
	if(pos >= margin)
	{
		ctx.strokeStyle = ctx.fillStyle = "#AFD";
		ctx.beginPath();
		ctx.moveTo(pos, 0); ctx.lineTo(pos, canvas.height);
		ctx.stroke();
		ctx.beginPath();
		ctx.moveTo(pos - 4, 0); ctx.lineTo(pos + 4, 0); ctx.lineTo(pos, 6);
		ctx.closePath();
		ctx.fill();
		ctx.beginPath();
		ctx.moveTo(pos - 4, canvas.height); ctx.lineTo(pos + 4, canvas.height); ctx.lineTo(pos, canvas.height - 6);
		ctx.closePath();
		ctx.fill();
	}

	//scroll
	if(this.session.scroll_y != 0)
	{
		ctx.save();
		ctx.translate( margin - 30, timeline_height * 0.5 );
		ctx.fillStyle = "#999";
		ctx.beginPath();
		ctx.moveTo(-10, 5); ctx.lineTo(0, -5); ctx.lineTo(10, 5);
		ctx.closePath();
		ctx.fill();
		ctx.restore();
	}

	if(data.last_track < data.num_tracks - 1)
	{
		ctx.save();
		ctx.translate( margin - 30, canvas.height - 30 );
		ctx.fillStyle = "#999";
		ctx.beginPath();
		ctx.moveTo(-10, -5); ctx.lineTo(0, 5); ctx.lineTo(10, -5);
		ctx.closePath();
		ctx.fill();
		ctx.restore();
	}

}

Timeline.prototype.setCurrentTime = function( time, skip_redraw )
{
	var duration = this.current_take ? this.current_take.duration : 0;
	if(time < 0)
		time = 0;

	//time = Math.round(time * 30) / 30;
	time = Math.clamp( time, 0, duration );

	if(time == this.session.current_time)
		return;

	this.session.current_time = time;
	this.current_time_widget.setValue( time.toFixed(2) );

	if(!skip_redraw && this.canvas.offsetParent !== null)
		this.redrawCanvas();

	if(this.preview && this.current_take)
	{
		this.current_take.applyTracks( this.session.current_time );
		LS.GlobalScene.refresh();
	}
}


Timeline.prototype.setDuration = function( time, skip_redraw  )
{
	time = Math.round(time * this.framerate) / this.framerate;
	if(time < 0)
		time = 0;

	if(!this.current_take)
		return;

	if(time == this.current_take.duration)
		return;

	this.current_take.duration = time;
	if(this.session.current_time > this.current_take.duration)
		this.setCurrentTime( this.current_take.duration, true );
	this.duration_widget.setValue( time.toFixed(2) );

	if(!skip_redraw)
		this.redrawCanvas();
}

Timeline.prototype.showPropertyInfo = function( track )
{
	this.current_track = track;
	if(!track)
	{
		this.property_widget.setValue( "" );
		this.interpolation_widget.setValue( LS.NONE );
		return;
	}

	var info = track.getPropertyInfo();
	if(!info)
		return;

	this.property_widget.setValue( info.name );
	this.interpolation_widget.setValue( track.interpolation );
}

Timeline.prototype.update = function( dt )
{
	if(!this.playing || !this.current_take)
		return;

	var time = this.session.current_time + dt;
	if( time >= this.current_take.duration )
		time = time - this.current_take.duration;

	this.setCurrentTime( time );
}

Timeline.prototype.canvasTimeToX = function( time )
{
	return this.session.left_margin + (time - this.session.start_time) * this.session.seconds_to_pixels ;
}

Timeline.prototype.canvasXToTime = function( x )
{
	return (x - this.session.left_margin) / this.session.seconds_to_pixels + this.session.start_time;
}

Timeline.prototype.onMouse = function(e)
{
	if(!this.session)
		return;

	var root_element = this.canvas;//e.target;
	var b = root_element.getBoundingClientRect();
	e.mousex = e.pageX - b.left;
	e.mousey = e.pageY - b.top;
	e.canvasx = e.mousex;
	e.canvasy = b.height - e.mousey;

	var item = this.getMouseItem(e);
	this.canvas.style.cursor = item ? item.cursor : "default";
	this._last_item = item;

	if( e.type == "mousedown" )
	{
		LiteGUI.focus_widget = this;
		this.mouse_dragging = true;

		if(item)
		{
			if(item.draggable)
				this._item_dragged = item;
			else
				this._item_dragged = null;

			if(item.type == "timeline")
				this.setCurrentTime( this.canvasXToTime( e.mousex ) );
			else if(item.type == "track")
				this.showPropertyInfo( this.current_take.tracks[ item.track ] );

			this.prev_mouse = [ e.mousex, e.mousey ];
			this._must_redraw = true;
		}

		this._binded_mouseup = this.onMouse.bind(this);
		document.body.addEventListener("mousemove", this._binded_mouseup );
		document.body.addEventListener("mouseup", this._binded_mouseup );
		e.preventDefault();
		e.stopPropagation();
	}
	else if( e.type == "mousemove" )
	{

		if( this.mouse_dragging )
		{
			if( this._item_dragged )
			{
				if( this._item_dragged.type == "timeline" )
				{
					this.setCurrentTime( this.canvasXToTime( e.mousex ) );
				}
				else if( this._item_dragged.type == "split" )
				{
					var delta = e.mousex - this.prev_mouse[0];
					this.session.left_margin += delta;
					if(this.session.left_margin < 100)
						this.session.left_margin = 100;
					this.prev_mouse[0] = e.mousex;
				}
				else if( this._item_dragged.type == "keyframe" )
				{
					var newt = this.canvasXToTime( e.mousex );
					newt = Math.round( newt * this.framerate ) / this.framerate; //round
					var track = this.current_take.tracks[ this._item_dragged.track ];
					var keyframe = track.moveKeyframe( this._item_dragged.keyframe, newt );
					if(keyframe != -1 )
					{
						if(this.selection && this.selection.type == "keyframe" && this.selection.track == this._item_dragged.track && this.selection.keyframe == this._item_dragged.keyframe)
							this.selection.keyframe = keyframe;
						this._item_dragged.keyframe = keyframe;
					}
					else
						this._item_dragged = null;

				}
				else if( this._item_dragged.type == "background" )
				{
					//*
					var old = this.canvasXToTime( this.prev_mouse[0] );
					var now = this.canvasXToTime( e.mousex );
					this.session.start_time += old - now;
					this.prev_mouse[0] = e.mousex;
					//*/
				}

				this._must_redraw = true;
			}

			e.preventDefault();
			e.stopPropagation();
		}
	}
	else if( e.type == "mouseup" )
	{
		document.body.removeEventListener("mousemove", this._binded_mouseup );
		document.body.removeEventListener("mouseup", this._binded_mouseup );

		if(this.preview && this._item_dragged && this._item_dragged.type == "timeline")
			EditorModule.refreshAttributes();

		this.mouse_dragging = false;
		this._item_dragged = null;
		this._binded_mouseup = null;

	}

	if(this._must_redraw)
		this.redrawCanvas();

	return true;
}

Timeline.prototype.onKeyDown = function(e)
{
	switch( e.keyCode )
	{
		case 8:
		case 46: //delete key 
			this.removeSelection();
			break;
		default:
			return;
	}

	return true;
}


Timeline.prototype.onMouseWheel = function(e)
{
	if(!this.session)
		return;

	var root_element = this.canvas;//e.target;
	var b = root_element.getBoundingClientRect();
	e.mousex = e.pageX - b.left;
	e.mousey = e.pageY - b.top;

	if(e.mousex < this.session.left_margin)
	{
		if(e.deltaY)
			this.session.scroll_y += e.deltaY > 0 ? 1 : -1;
		if(this.session.scroll_y > this._timeline_data.num_tracks - 1)
			this.session.scroll_y = this._timeline_data.num_tracks - 1;
		if(this.session.scroll_y < 0)
			this.session.scroll_y = 0;
	}
	else
	{
		var x = this.canvasXToTime( e.mousex );
		if(e.deltaY > 0)
			this.session.seconds_to_pixels *= 0.95;
		else
			this.session.seconds_to_pixels *= 1.05;
		this.session.start_time += x - this.canvasXToTime( e.mousex );
	}

	this.updateTimelineData();
	this.getMouseItem(e);

	this.redrawCanvas();
	e.preventDefault();
	e.stopPropagation();
	return false;
}

Timeline.prototype.onContextMenu = function( e )
{
	if(!this.current_take)
		return;

	var that = this;
	var root_element = this.canvas;//e.target;
	var b = root_element.getBoundingClientRect();
	e.mousex = e.pageX - b.left;
	e.mousey = e.pageY - b.top;
	var item = this.getMouseItem(e);
	var track = null;
	if(item && item.track !== undefined )
		track = this.current_take.tracks[ item.track ];

	if(!track)
		return;

	var values = [];
	values.push( { title: track.enabled ? "Disable" : "Enable", callback: inner_toggle } );
	values.push( null );
	values.push( { title:"Delete", callback: inner_delete } );

	var menu = new LiteGUI.ContextualMenu( values, { event: e, callback: function(value) {
		that.redrawCanvas();
	}});

	function inner_toggle()
	{
		track.enabled = !track.enabled;
	}

	function inner_delete()
	{
		that.addUndoTrackRemoved( track );
		that.current_take.removeTrack( track );
	}

}

Timeline.prototype.addUndoTrackRemoved = function( track )
{
	var that = this;

	LiteGUI.addUndoStep({ 
		data: { animation: that.current_animation.name, take: that.current_take.name, track: track.serialize(), index: that.current_take.tracks.indexOf( track ) },
		callback: function(d) {
			var anim = LS.ResourcesManager.resources[d.animation];
			if(!anim)
				return;
			var take = anim.getTake(d.take);
			if(!take)
				return;
			var track = new LS.Animation.Track( d.track );
			take.tracks.splice( d.index,0, track );
			that.redrawCanvas();
		}
	});
}

Timeline.prototype.insertKeyframe = function( track )
{
	if(!track)
		return;

	//quantize time
	var time = Math.round( this.session.current_time * this.framerate) / this.framerate;

	//sample
	var info = track.getPropertyInfo();
	if(!info)
		return;

	//add
	track.addKeyframe( time , info.value );

	console.log("Keyframe added");
	this._must_redraw = true;
}

Timeline.prototype.removeSelection = function()
{
	if(!this.current_take || !this.session.selection)
		return;

	var selection = this.session.selection;
	var track = this.current_take.tracks[ selection.track ];
	if (selection.type == "keyframe")
	{
		if(track)
		{
			track.removeKeyframe( selection.keyframe );
			this.session.selection = null;
			this.redrawCanvas();
		}
	}
	else if (selection.type == "track")
	{
		if(track)
		{
			this.addUndoTrackRemoved( track );
			this.current_take.removeTrack( track );
			this.session.selection = null;
			this.redrawCanvas();
		}
	}
}


Timeline.prototype.getMouseItem = function( e )
{
	if(!this.current_take)
		return;

	var data = this._timeline_data;
	this._must_redraw = true;

	//timeline
	if(e.mousey < this.canvas_info.timeline_height && e.mousex > this.session.left_margin )
		return { type: "timeline", draggable: true, cursor: "col-resize" };

	//splitter
	if( Math.abs(this.session.left_margin - e.mousex) < 3 )
		return { type: "split", draggable: true, cursor: "e-resize" };

	//margin
	var track_index = Math.floor((e.mousey - this.canvas_info.timeline_height) / this.canvas_info.row_height) + this.session.scroll_y;
	var track = this.current_take.tracks[ track_index ];

	if(e.mousex < this.session.left_margin )
	{
		if( e.type == "mousedown" && track )
		{
			if( track && e.mousex < 10 )
				this.insertKeyframe( track );
			else if( track && e.mousex < 30 )
				track.enabled = !track.enabled;
			this.session.selection = { type: "track", track: track_index };
			this._must_redraw = true;
		}

		if(track)
			return { type: "track", track: track_index, cursor: "pointer" };
	}

	//test keyframe
	if(!track)
		return { type: "background", track: track_index, draggable: true, cursor: null };

	var time = this.canvasXToTime( e.mousex );
	var index = track.findTimeIndex( time );
	if(index != -1)
	{
		var keyframe = track.getKeyframe( index );
		var key_pos = this.canvasTimeToX( keyframe[0] );
		var over = false;

		if( (key_pos - 5) < e.mousex && e.mousex < (key_pos + 10) )
			over = true;

		//if(key_pos < e.mousex && e.mousex < key_pos + data.keyframe_width )
		//	over = true;

		this._must_redraw = true;

		if(e.type == "mousedown" )
		{
			if(over)
			{
				this.session.selection = { type: "keyframe", track: track_index, keyframe: index };
				this.setCurrentTime( keyframe[0] );
			}
			else
				this.session.selection = null;
		}

		if(over)
			return { type: "keyframe", track: track_index, keyframe: index, cursor: "crosshair", draggable: true };
		else
			return { type: "background", track: track_index, draggable: true, cursor: null };
	}

	return null;
}

Timeline.prototype.renderEditor = function()
{
	//used to render trajectories
	//TO DO
}

Timeline.prototype.showNewAnimationDialog = function()
{
	var that = this;

	var dialog = LiteGUI.Dialog.getDialog("new_animation");
	if(dialog)
	{
		dialog.highlight();
		return;
	}

	dialog = new LiteGUI.Dialog("new_animation",{ title:"New Timeline", draggable: true, closable: true });
	
	var widgets = new LiteGUI.Inspector();
	widgets.addString("Name","test");
	widgets.addFolder("Folder","");
	widgets.addNumber("Duration",20, {min:0,step:0.1,units:"s"});
	widgets.addButtons(null,["Create","Cancel"], function(v){
		if(v == "Cancel")
		{
			dialog.close();
			return;
		}

		var name = widgets.widgets["Name"].getValue() + ".wbin";
		var folder = widgets.widgets["Folder"].getValue();
		var duration = parseFloat( widgets.widgets["Duration"].getValue() );
		that.onNewAnimation( name, duration, folder );
		dialog.close();
	});

	dialog.add( widgets );
	dialog.adjustSize();
	dialog.show();
}