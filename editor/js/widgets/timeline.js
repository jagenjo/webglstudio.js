function Timeline()
{
	this.root = null;

	this.canvas_info = {
		timeline_height: 30,
		row_height: 20
	};

	this.mode = "keyframes";
	this.preview = true;
	this.paths_widget = false;
	this.autoresize = true;

	this.current_take = null;

	this._timeline_data = {};

	this.framerate = LS.Animation.Track.FRAMERATE;

	LEvent.bind( LS.GlobalScene, "change", this.onReload, this );
	//LEvent.bind( LS.GlobalScene, "reload", this.onReload, this );

	this.createInterface();
	LiteGUI.createDropArea( this.canvas, this.onItemDrop.bind(this) );
	//this.onNewAnimation();
}

Timeline.widget_name = "Timeline";
Timeline.interpolation_values = {"none": LS.NONE, "linear": LS.LINEAR, "bezier": LS.BEZIER }

CORE.registerWidget( Timeline );

Timeline.createDialog = function( parent )
{
	var dialog = new LiteGUI.Dialog( null, { title: Timeline.widget_name, fullcontent: true, closable: true, draggable: true, detachable: true, minimize: true, resizable: true, parent: parent, width: 900, height: 500 });
	var widget = new Timeline();
	dialog.add( widget );
	dialog.widget = widget;
	dialog.on_close = function()
	{
		//widget.unbindEvents();		
	}
	return dialog;
}

Timeline.prototype.destroy = function()
{
	LEvent.unbind( LS.GlobalScene, "change", this.onReload, this );
	//LEvent.unbind( LS.GlobalScene, "reload", this.onReload, this );
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
	this.root.style.backgroundColor = "#2a2a2a";
	widgets.root.style.paddingTop = "4px";

	widgets.addButton(null,"Options", { width: 80, callback: function(v,e){ that.showOptionsContextMenu(e); } });
	/*
		if(v == "New")
		{
			that.showNewAnimationDialog();
			//that.onNewAnimation();
		}
		else if(v == "Load")
			that.onLoadAnimation();
		else if(v == "Scene")
			that.onSceneAnimation();
	});
	*/
	var that = this;
	this.animation_widget = widgets.addString(null, "", { disabled: true } );
	this.duration_widget = widgets.addNumber("Duration", 0, { units:"s", precision:2, min:0, callback: function(v){ that.setDuration(v); } } );
	this.current_time_widget = widgets.addNumber("Current", this.session ? this.session.current_time : 0, { units:"s", precision:2, min: 0, callback: function(v){ that.setCurrentTime(v); } } );
	//widgets.addCheckbox("Preview", this.preview, { callback: function(v){ that.preview = v; } } );
	//this.play_widget = widgets.addCheckbox("Play", !!this.playing, { callback: function(v){ that.playing = !that.playing ; } } );
	this.preview_widget = widgets.addIcon(null, !!this.preview, { image: "imgs/icons-timeline.png", index: 6, title:"preview",  callback: function(v){ that.preview = !that.preview ; } } );
	this.play_widget = widgets.addIcon(null, !!this.playing, { title:"play", image: "imgs/icons-timeline.png",  callback: function(v){ that.playing = !that.playing ; } } );
	widgets.addIcon(null, false, { title:"zoom in", image: "imgs/icons-timeline.png", index: 8, toggle: false, callback: function(v){ that.zoom(1.05); 	that.redrawCanvas(); } } );
	widgets.addIcon(null, false, { title:"zoom out", image: "imgs/icons-timeline.png", index: 7, toggle: false, callback: function(v){ that.zoom(0.95); that.redrawCanvas(); } } );
	widgets.addIcon(null, false, { title:"previous keyframe", image: "imgs/icons-timeline.png", index: 2, toggle: false, callback: function(v){ that.prevKeyframe(); } } );
	widgets.addIcon(null, false, { title:"next keyframe", image: "imgs/icons-timeline.png", index: 3, toggle: false, callback: function(v){ that.nextKeyframe(); } } );
	widgets.addIcon(null, false, { title:"record", image: "imgs/icons-timeline.png", index: 10, toggle: true, callback: function(v){ return that.toggleRecording(v); } } );
	//this.paths_widget = widgets.addCheckbox("Show Paths", !!this.show_paths, { callback: function(v){ that.show_paths = !that.show_paths ; } } );
	//widgets.addCheckbox("Curves", this.mode == "curves", { callback: function(v){ that.mode = v ? "curves" : "keyframes"; that.redrawCanvas(); } } );

	this.property_widget = widgets.addString("Property", "", { disabled: true, width: "auto" } );
	this.property_widget.style.marginLeft = "10px";
	this.interpolation_widget = widgets.addCombo("Interpolation", "none", { values: Timeline.interpolation_values, width: 200, callback: function(v){ 
		if( !that.current_track || that.current_track.interpolation == v )
			return;
		if( that.current_track.isInterpolable() )
		{
			that.current_track.interpolation = v;
			that.animationModified();
		}
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

//called when an animation has been modified
Timeline.prototype.animationModified = function()
{
	if(!this.current_animation)
		return;

	this.current_animation._modified = true;
	LS.ResourcesManager.resourceModified( this.current_animation );
	LS.GlobalScene.refresh();
}

Timeline.prototype.onLoadAnimation = function()
{
	var that = this;
	EditorModule.showSelectResource( { type:"animation", on_complete: inner.bind(this) } );

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

		/*
		LS.ResourcesManager.load( name, function(url, resource) {
			console.log( url, resource );
		});
		*/
	}
}

Timeline.prototype.onSceneAnimation = function()
{
	if(!LS.GlobalScene.animation)
	{
		LS.GlobalScene.animation = new LS.Animation();
		LS.GlobalScene.animation.name = LS.Animation.DEFAULT_SCENE_NAME;
		var take = LS.GlobalScene.animation.createTake( "default", Timeline.DEFAULT_DURATION );
	}

	this.setAnimation( LS.GlobalScene.animation );
}

Timeline.prototype.setAnimation = function( animation, take_name )
{
	if(this.current_animation == animation)
		return;

	if(!animation)
	{
		this.current_animation = null;
		this.current_take = null;
		this.animation_widget.setValue( "" );
		this.duration_widget.setValue( 0 );
		this.session = null;
		this.redrawCanvas();
		return;
	}

	this.session = {
		start_time: 0, //time at left side of window
		current_time: 0,
		last_time: 0,
		seconds_to_pixels: 50, //how many pixels represent one second
		left_margin: 220,
		scroll_y: 0,
		offset_y: 0,
		scale_y: 1, //pixels to units
		selection: null
	};

	this.current_animation = animation;
	this.animation_widget.setValue( animation.name );
	this.current_take = animation.getTake( take_name || "default" );
	this.duration_widget.setValue( this.current_take.duration );

	//to ensure data gets saved again
	LS.ResourcesManager.resourceModified( animation );

	//unpack all
	if(0)
		for(var i = 0; i < this.current_take.length; ++i)
		{
			var track = this.current_take[i];
			track.unpackData();
		}

	//update canvas
	this.redrawCanvas();
}

Timeline.prototype.resize = function( skip_redraw )
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

	if(!skip_redraw)
		this.redrawCanvas();
}

/*
Timeline.prototype.resize = function()
{
	var w = this.canvas.parentNode.offsetWidth;
	var h = this.canvas.parentNode.offsetHeight;
	if(this.canvas.width != w || this.canvas.height != h)
	{
		this.canvas.width = w;
		this.canvas.height = h;
		this._must_redraw = true;
	}
}
*/

//globals used for rendering and interaction
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
		ctx.fillStyle = (i+data.first_track) % 2 == 0 ? "#222" : "#2A2A2A";
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

		var main_word = "";
		var secondary_word = "";

		if(track._property_path[0][0] != "@" || track._target && track._target._root )
		{
			main_word = track._property_path[0][0] != "@" ? track._property_path[0] : track._target._root.name;
			secondary_word = track.name;
		}
		else
		{
			main_word = track.name;
			secondary_word = track.type + (track.packed_data ? "*" : "");
		}

		ctx.globalAlpha = track.enabled ? 1 : 0.5;
		ctx.font = "12px Arial";
		ctx.fillStyle = "rgba(255,255,255,0.6)";
		ctx.fillText( main_word , 28.5, Math.floor(y + line_height * 0.8) - 0.5 );
		var info = ctx.measureText( main_word );
		ctx.fillStyle = "rgba(255,255,100,0.4)";
		ctx.fillText( secondary_word, 32.5 + info.width, Math.floor( y + line_height * 0.8) - 0.5 );
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
			if(num == 0)
				continue;

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
				ctx.strokeStyle = ctx.fillStyle;

				var posx = this.canvasTimeToX( keyframe[0] );

				if(1) //diamonds
				{
					if( (posx + 5) < margin)
						continue;

					ctx.save();
					var offset_y = y + line_height * 0.5;
					ctx.beginPath();
					ctx.moveTo( posx + 0.5, 10);
					ctx.lineTo( posx + 0.5, timeline_height);
					ctx.stroke();
					ctx.beginPath();
					ctx.moveTo( posx, offset_y + 5);
					ctx.lineTo( posx + 5, offset_y);
					ctx.lineTo( posx, offset_y - 5);
					ctx.lineTo( posx - 5, offset_y );
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
					ctx.fillRect( posx, y + 2, w - 1, line_height - 4);
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
				if(!keyframe) //weird bugs
					continue;
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
	//if(!this.session) return;

	var duration = this.current_take ? this.current_take.duration : 0;
	if(time < 0)
		time = 0;

	//time = Math.round(time * 30) / 30;
	time = Math.clamp( time, 0, duration );

	if(time == this.session.current_time)
		return;

	this.session.current_time = time;
	this.current_time_widget.setValue( time );

	//auto scroll when the cursor exits
	if( this._timeline_data && time > this._timeline_data.end_time ) 
		this.session.start_time += this._timeline_data.end_time;

	//redraw only if visible
	if(!skip_redraw && this.canvas.offsetParent !== null)
		this.redrawCanvas();

	//preview: apply track samples to scene
	if(this.preview && this.current_take)
	{
		//recording is special case
		if(this.recording && this._recording_time >= 0)
		{
			//apply tracks and store last value to check if we need to create keyframe
			for(var i = 0; i < this.current_take.tracks.length; ++i)
			{
				var track = this.current_take.tracks[i];
				if(!track.enabled || !track.data)
				continue;
				var sample = track.getSample( time );
				if( sample !== undefined )
				{
					track._target = LS.GlobalScene.setPropertyValueFromPath( track._property_path, sample, 0 );
					track._last_sample = sample; //store last value
				}
			}
		}
		else
			this.current_take.applyTracks( this.session.current_time, this.session.last_time );

		this.session.last_time = this.session.current_time;
		LS.GlobalScene.refresh();
	}
}

Timeline.prototype.applyTracks = function( force )
{
	if(!this.current_take)
		return;

	if(this.preview || force)
		this.current_take.applyTracks( this.session.current_time, this.session.last_time );
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
	this.duration_widget.setValue( time );

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
	if(!this.current_take || (!this.recording && !this.playing) )
		return;


	if(this.recording)
	{
		//update coundown in screen
		var elem = document.getElementById("timeline-recording-countdown");
		if(this._recording_time < 0)
		{
			if(elem)
			{
				var text = Math.abs(this._recording_time).toFixed(2);
				elem.innerHTML = text;
			}
			this._recording_time += dt;
		}
		else
		{
			//elem.style.display = "none";
			elem.innerHTML = "GO";
			elem.style.opacity = 0;

			//increase
			var time = this.session.current_time + dt;
			if( time >= this.current_take.duration )
				this.current_take.duration = time;
			var sampled = this.sampleAllTracks(true,time); //sample current values
			this.setCurrentTime( time ); //apply changes if preview is on
		}
	}
	
	if(this.playing)
	{
		var time = this.session.current_time + dt;
		if( time >= this.current_take.duration )
			time = time - this.current_take.duration;
		this.setCurrentTime( time );
	}
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
	if( this.autoresize )
		this.resize();

	if(!this.session)
	{
		if(this._must_redraw)
			this.redrawCanvas();
		return;
	}

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

			if(item.type == "keyframe")
			{
				var track = this.current_take.tracks[ item.track ];
				//this.addUndoTrackEdited( track );
			}

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
					if(track.packed_data)
						return;

					var keyframe = track.data[this._item_dragged.keyframe];
					keyframe[0] = newt;
					track.sortKeyframes();
					var index = track.data.indexOf(keyframe);
					if(this.selection && this.selection.type == "keyframe" && this.selection.track == this._item_dragged.track && this.selection.keyframe == this._item_dragged.keyframe)
						this.selection.keyframe = index;
					this._item_dragged.keyframe = index;
					this.animationModified();

					/*
					var keyframe = track.moveKeyframe( this._item_dragged.keyframe, newt );
					if(keyframe != -1 )
					{
						if(this.selection && this.selection.type == "keyframe" && this.selection.track == this._item_dragged.track && this.selection.keyframe == this._item_dragged.keyframe)
							this.selection.keyframe = keyframe;
						this._item_dragged.keyframe = keyframe;
					}
					else
						this._item_dragged = null;
					*/

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

Timeline.prototype.zoom = function( v, centerx )
{
	if(!this.session)
		return;

	centerx = centerx || this.canvas.width * 0.5;
	var x = this.canvasXToTime( centerx );
	this.session.seconds_to_pixels *= v;
	this.session.start_time += x - this.canvasXToTime( centerx );
}

Timeline.prototype.prevKeyframe = function()
{
	if(!this.session)
		return;

	var current_time = Math.round( this.session.current_time * this.framerate ) / this.framerate - 0.001; //quantize
	var closest_time = 0;

	for(var i = 0; i < this.current_take.tracks.length; ++i)
	{
		var track = this.current_take.tracks[ i ];
		var index = track.findTimeIndex( current_time );
		if(index == -1)
			continue;
		var keyframe = track.getKeyframe(index);
		if(!keyframe)
			continue;
		var time = Math.round( keyframe[0] * this.framerate ) / this.framerate; //quantize
		if(time <= closest_time || time >= current_time )
			continue;
		closest_time = keyframe[0];
	}

	this.setCurrentTime( closest_time );
}

Timeline.prototype.nextKeyframe = function()
{
	if(!this.session)
		return;

	var current_time = Math.round( this.session.current_time * this.framerate ) / this.framerate + 0.001; //quantize
	var closest_time = this.current_take.duration;

	for(var i = 0; i < this.current_take.tracks.length; ++i)
	{
		var track = this.current_take.tracks[ i ];
		var num = track.getNumberOfKeyframes();
		if( num == 0 )
			continue;

		var index = track.findTimeIndex( current_time );
		if((index + 1) >= num)
			continue;

		var keyframe = track.getKeyframe(index+1);
		if(!keyframe)
			continue;
		var time = Math.round( keyframe[0] * this.framerate ) / this.framerate; //quantize
		if(time >= closest_time || time <= current_time)
			continue;
		closest_time = time;
	}

	this.setCurrentTime( closest_time );
}

Timeline.prototype.onShow = function()
{
	this.resize();
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
		if(e.deltaY > 0)
			this.zoom( 0.95, this.session.left_margin ); //e.mousex
		else
			this.zoom( 1.05, this.session.left_margin );
	}

	this.updateTimelineData();
	this.getMouseItem(e);

	this.redrawCanvas();
	e.preventDefault();
	e.stopPropagation();
	return false;
}

Timeline.prototype.showOptionsContextMenu = function( e )
{
	var that = this;
	var options = ["New Animation","Load Animation","Scene Animation",null];
	var animation_options = {title:"Animation Options",disabled:!this.current_take};
	options.push(animation_options);

	var menu = new LiteGUI.ContextualMenu( options, { event: e, callback: function(v) {
		if(v == "New Animation")
			that.showNewAnimationDialog();
		else if(v == "Load Animation")
			that.onLoadAnimation();
		else if(v == "Scene Animation")
			that.onSceneAnimation();
		else if(v == animation_options)
			that.onShowAnimationOptionsDialog();
	}});
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

	var time = this.session.current_time; //this.canvasXToTime( e.mousex );

	var values = [];

	values.push( { title: "Add New Track", callback: this.showNewTrack.bind(this) } );
	values.push( null );

	if(item.type == "keyframe" && track.type == "events")
		values.push( { title: "Edit Event", callback: inner_edit_event_keyframe } );

	if(track)
	{
		values.push( { title: "Select Node", callback: inner_select } );
		if(track.type == "events")
			values.push( { title: "Add Event", callback: inner_add_event_keyframe } );
		else
			values.push( { title: "Add Keyframe", callback: inner_add_keyframe } );
		values.push( { title: "Options", callback: inner_options } );
		values.push( { title: track.enabled ? "Disable" : "Enable", callback: inner_toggle } );
		values.push( null );
		values.push( { title:"Clone Track", callback: inner_clone } );
		values.push( { title:"Clear Track", callback: inner_clear } );
		values.push( { title:"Delete Track", callback: inner_delete } );
	}

	var menu = new LiteGUI.ContextualMenu( values, { event: e, callback: function(value) {
		that.redrawCanvas();
	}});

	function inner_toggle()
	{
		track.enabled = !track.enabled;
		that.animationModified();

	}

	function inner_select()
	{
		var info = track.getPropertyInfo();
		if(!info)
			return;
		SelectionModule.setSelection(info.node);
	}

	function inner_clear()
	{
		that.addUndoTrackRemoved( track );
		track.clear();
		that.animationModified();
	}

	function inner_clone()
	{
		var new_track = new LS.Animation.Track( track.serialize() );
		that.current_take.addTrack( new_track );
		that.addUndoTrackCreated( new_track );
		that.animationModified();
	}

	function inner_delete()
	{
		that.addUndoTrackRemoved( track );
		that.current_take.removeTrack( track );
		that.animationModified();
	}

	function inner_options()
	{
		that.showTrackOptionsDialog( track );
	}

	function inner_add_keyframe()
	{
		that.insertKeyframe( track );
		that.animationModified();
	}

	function inner_add_event_keyframe()
	{
		that.showAddEventKeyframeDialog(track, time);
	}

	function inner_edit_event_keyframe()
	{
		that.showAddEventKeyframeDialog(track, time, track.getKeyframe( item.keyframe ) );
	}
	
}

Timeline.prototype.addUndoTakeEdited = function( info )
{
	if(!info)
		return;

	var that = this;

	UndoModule.addUndoStep({ 
		title: "Take edited ",
		data: { animation: that.current_animation.name, take: info.name, data: info },
		callback: function(d) {
			var anim = d.animation == LS.Animation.DEFAULT_SCENE_NAME ? LS.GlobalScene.animation : LS.ResourcesManager.resources[ d.animation ];
			if(!anim)
				return;
			var take = anim.getTake(d.take);
			if(!take)
				return;
			take.configure( d.data );
			that.animationModified();
			that.redrawCanvas();
		}
	});
}

Timeline.prototype.addUndoTrackCreated = function( track )
{
	if(!track)
		return;

	var that = this;

	UndoModule.addUndoStep({ 
		title: "Track created: " + track.name,
		data: { animation: that.current_animation.name, take: that.current_take.name, index: that.current_take.tracks.indexOf( track ) },
		callback: function(d) {
			var anim = d.animation == LS.Animation.DEFAULT_SCENE_NAME ? LS.GlobalScene.animation : LS.ResourcesManager.resources[ d.animation ];
			if(!anim)
				return;
			var take = anim.getTake(d.take);
			if(!take)
				return;
			var track = take.tracks[ d.index ];
			if(track)
				take.removeTrack( track );
			that.animationModified();
			that.redrawCanvas();
		}
	});
}

Timeline.prototype.addUndoTrackEdited = function( track )
{
	if(!track)
		return;

	var that = this;

	UndoModule.addUndoStep({ 
		title: "Track edited: " + track.name,
		data: { animation: that.current_animation.name, take: that.current_take.name, track: track.serialize(), index: that.current_take.tracks.indexOf( track ) },
		callback: function(d) {
			var anim = d.animation == LS.Animation.DEFAULT_SCENE_NAME ? LS.GlobalScene.animation : LS.ResourcesManager.resources[ d.animation ];
			if(!anim)
				return;
			var take = anim.getTake(d.take);
			if(!take)
				return;
			var track = take.tracks[ d.index ];
			if(track)
				track.configure( d.track );
			that.animationModified();
			that.redrawCanvas();
		}
	});
}

Timeline.prototype.addUndoTrackRemoved = function( track )
{
	var that = this;

	UndoModule.addUndoStep({ 
		title: "Track removed: " + track.name,
		data: { animation: that.current_animation.name, take: that.current_take.name, track: track.serialize(), index: that.current_take.tracks.indexOf( track ) },
		callback: function(d) {
			var anim = d.animation == LS.Animation.DEFAULT_SCENE_NAME ? LS.GlobalScene.animation : LS.ResourcesManager.resources[ d.animation ];
			if(!anim)
				return;
			var take = anim.getTake(d.take);
			if(!take)
				return;
			var track = new LS.Animation.Track( d.track );
			take.tracks.splice( d.index,0, track );
			that.animationModified();
			that.redrawCanvas();
		}
	});
}

Timeline.prototype.onInsertKeyframeButton = function( button, relative )
{
	var take = this.current_take;
	if(!take)
	{
		LiteGUI.alert("No track selected, create a new one using the animation editor.");
		return;
	}

	//show dialog to select keyframe options (by uid or nodename)
	//TODO

	var locator = button.dataset["propertyuid"];
	var original_locator = locator;
	var name = button.dataset["propertyname"];

	var info = LS.GlobalScene.getPropertyInfo( locator );
	if(info === null)
		return console.warn("Property info not found: " + locator );

	//convert absolute to relative locator
	if( relative )
	{
		var t = locator.split("/");
		if(info.node && info.node.uid == t[0])
		{
			t[0] = info.node.name;
			if(info.target)
				t[1] = LS.getObjectClassName( info.target );
			locator = t.join("/");
		}
	}

	//quantize time
	var time = Math.round( this.session.current_time * 30) / 30;

	var size = 0;
	var value = info.value;
	var interpolation = LS.BEZIER;
	if(info.value !== null)
	{
		if( info.value.constructor == Float32Array )
			size = info.value.length;
		else if( info.value.constructor === Number )
			size = 1;
	}

	if(size == 0 || info.type == "enum")
		interpolation = LS.NONE;

	var track = take.getTrack( locator );
	var track_created = false;
	if(!track)
	{
		//search for a track that has the same locator (in case you created a relative track and clicked the animation button)
		for(var i = 0; i < take.tracks.length; ++i)
		{
			if( take.tracks[i]._original_locator != original_locator )
				continue;
			track = take.tracks[i];
			break;
		}

		if(!track)
		{
			track = take.createTrack( { name: name, property: locator, type: info.type, value_size: size, interpolation: interpolation, duration: this.session.end_time, data: [] } );
			track._original_locator = original_locator;
			track_created = true;
		}
	}

	//undo
	if(track_created)
		this.addUndoTrackCreated( track );
	else
		this.addUndoTrackEdited( track );

	console.log("Keyframe added");
	track.addKeyframe( time , value );

	this.redrawCanvas();
	RenderModule.requestFrame();
}

Timeline.prototype.insertKeyframe = function( track, only_different, time )
{
	if(!track)
		return false;

	//quantize time
	if(time === undefined)
		time = this.session.current_time;
	time = Math.round( time * this.framerate ) / this.framerate;

	//sample
	var info = track.getPropertyInfo();
	if(!info)
		return false;

	//only store if the value is different
	if( only_different && track._last_sample !== undefined )
	{
		//sample
		if( track.value_size == 1)
		{
			if( Math.abs(track._last_sample - info.value) < 0.0001 )
				return false; //same value
		}
		else if(track.value_size > 1)
		{
			for(var i = 0; i < track.value_size; ++i)
			{
				if( Math.abs(track._last_sample[i] - info.value[i]) < 0.0001 )
					return false; //same value
			}
		}
		else
			if( track._last_sample == info.value )
				return false; //same value
	}

	//add
	track.addKeyframe( time , info.value );
	this.animationModified();

	this._must_redraw = true;
	RenderModule.requestFrame();
	return true;
}

Timeline.prototype.sampleAllTracks = function( only_different, time )
{
	if(!this.current_take)
		return false;

	var sampled_tracks = {};

	for(var i = 0; i < this.current_take.tracks.length; ++i)
	{
		var track = this.current_take.tracks[i];
		if(track.enabled === false)
			continue;

		if( this.insertKeyframe(track, only_different, time) )
			sampled_tracks[i] = true;
		//var sample = track.getSample(this.session.current_time, true);
		//var info = track.getPropertyInfo();
	}

	return sampled_tracks;
}

Timeline.prototype.removeSelection = function()
{
	if(!this.current_take || !this.session.selection)
		return;

	this.animationModified();

	var selection = this.session.selection;
	this.session.selection = null;
	var track = this.current_take.tracks[ selection.track ];
	if (selection.type == "keyframe")
	{
		if(track)
		{
			this.addUndoTrackEdited( track );
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
	LS.GlobalScene.refresh();
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
	var time = this.canvasXToTime( e.mousex );

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
	if(!track || e.button == 1 || time < 0)
		return { type: "background", track: track_index, draggable: true, cursor: null };

	var index = track.findTimeIndex( time + 5 / this.session.seconds_to_pixels );
	//if(index == -1)
	//	index = track.findTimeIndex( time );
	if(index == -1)
		return { type: "background", track: track_index, draggable: true };
	
	var keyframe = track.getKeyframe( index );
	if(!keyframe) //weird bugs happend sometimes
		return null;

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

	return null;
}

Timeline.prototype.renderEditor = function()
{
	//used to render trajectories
	//?? but it does! where is the code then?
}


Timeline.prototype.onShowAnimationOptionsDialog = function()
{
	var that = this;
	if(!this.current_take)
		return;

	var dialog = LiteGUI.Dialog.getDialog("animation_options");
	if(dialog)
	{
		dialog.highlight();
		return;
	}

	dialog = new LiteGUI.Dialog("animation_options",{ title:"Animation Options", width: 400, draggable: true, closable: true });
	
	var widgets = new LiteGUI.Inspector();
	widgets.addString("Name", this.current_animation.filename, { disabled: true } );
	widgets.addInfo("Tracks", this.current_take.tracks.length );

	//actions
	widgets.widgets_per_row = 2;
	var values = ["Use names as ids","Optimize Tracks","Match Translation","Only Rotations"];
	var action = values[0];
	widgets.addCombo("Actions", action,{ values: values, width: "80%", callback: function(v){
		action = v;	
	}});

	widgets.addButton(null,"Go",{ width: "20%", callback: function(){
		var total = 0;

		if(action == "Use names as ids")
			total = that.current_take.convertIDstoNames(true);
		else if(action == "Optimize Tracks")
			total = that.current_take.optimizeTracks();
		else if(action == "Match Translation")
			total = that.current_take.matchTranslation();
		else if(action == "Only Rotations")
			total = that.current_take.onlyRotations();

		LiteGUI.alert("Tracks modified: " + total);
		if(total)
			LS.ResourcesManager.resourceModified( that.current_animation );
	}});
	widgets.widgets_per_row = 1;

	//interpolation
	widgets.widgets_per_row = 2;
	var interpolation = Timeline.interpolation_values["linear"];
	widgets.addCombo("Set Interpolation to all tracks", interpolation, { values: Timeline.interpolation_values, width: "80%", callback: function(v){
		interpolation = v;	
	}});

	widgets.addButton(null,"Go",{ width: "20%", callback: function(){
		var total = that.current_take.setInterpolationToAllTracks( interpolation );
		LiteGUI.alert("Tracks modified: " + total);
		if(total)
			LS.ResourcesManager.resourceModified( that.current_animation );
	}});
	widgets.widgets_per_row = 1;

	
	widgets.addSeparator();
	widgets.addButton(null,"Close", function(){
		dialog.close();	
	});

	dialog.add( widgets );
	dialog.adjustSize(4);
	dialog.show( null, this.root );
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

		var name = widgets.widgets_by_name["Name"].getValue() + ".wbin";
		var folder = widgets.widgets_by_name["Folder"].getValue();
		var duration = parseFloat( widgets.widgets_by_name["Duration"].getValue() );
		that.onNewAnimation( name, duration, folder );
		dialog.close();
	});

	dialog.add( widgets );
	dialog.adjustSize();
	dialog.show( null, this.root );
}

Timeline.prototype.showNewTrack = function()
{
	var that = this;
	var dialog = new LiteGUI.Dialog("new_animation_track",{ title:"New Track", width: 500, draggable: true, closable: true });
	
	var locator = "";
	var info = null;
	var value_size = 0;

	var widgets = new LiteGUI.Inspector();
	widgets.addString("Name", "mytrack");
	widgets.addString("Property", "", function(v){ 
		locator = v;
		info = LS.GlobalScene.getPropertyInfo( locator );
		if(!info)
		{
			node_widget.setValue("-----");
			type_widget.setValue("-----");
			return;
		}
		node_widget.setValue( info.node.name );
		type_widget.setValue( info.type );
	});

	var node_widget = widgets.addString("Node", "", { disabled: true } );
	var type_widget = widgets.addString("Type", "", { disabled: true } );

	widgets.addCombo("Interpolation", "none", { values: Timeline.interpolation_values, callback: function(v){ 
		
	}});
	widgets.addButtons(null,["Create","Cancel"], function(v){
		if(v == "Create" && locator)
		{
			info = LS.GlobalScene.getPropertyInfo( locator );
			if(info !== null)
			{
				if(info.value !== undefined && info.value !== null)
				{
					if( typeof(info.value) == "number" )
						value_size = 1;
					else if( info.value && (info.value.constructor === Array || info.value.constructor === Float32Array) )
						value_size = info.value.length;
				}
				else if(info.type == "component" || info.type == "object")
					info.type = "events";
			}

			that.createTrack({ name: widgets.values["Name"], locator: locator, type: (info ? info.type : null), value_size: value_size, interpolation: widgets.values["Interpolation"] });
		}
		dialog.close();
		that.redrawCanvas();
		return;
	});

	dialog.add( widgets );
	dialog.adjustSize();
	dialog.show( null, this.root );
}

Timeline.prototype.createTrack = function( options )
{
	if(!options || !this.current_take)
		return;

	var name = options.name;
	var locator = options.locator;
	var interpolation = options.interpolation || LS.NONE;
	var type = options.type || "number";
	var value_size = options.value_size || 0;

	var track = new LS.Animation.Track({ name: name, property: locator, type: type, value_size: value_size, interpolation: interpolation });
	this.current_take.addTrack( track );
	this.addUndoTrackCreated( track );
	this.animationModified();

	return track;
}

Timeline.prototype.showTrackOptionsDialog = function( track )
{
	var that = this;
	var dialog = new LiteGUI.Dialog("track options",{ title:"Track Options", width: 500, draggable: true, closable: true });
	
	var widgets = new LiteGUI.Inspector();
	widgets.on_refresh = inner_refresh;
	inner_refresh();

	function inner_refresh(){
		widgets.clear();

		widgets.addCheckbox("Enabled", track.enabled, function(v){ 
			track.enabled = v; that.redrawCanvas();
			that.animationModified();
		});
		widgets.addString("Name", track.name, function(v){ 
			track.name = v; that.redrawCanvas();
			that.animationModified();
		});

		widgets.widgets_per_row = 2;

		widgets.addString("Property", track.property, { width: "70%", callback: function(v){ 
			var info = track.getPropertyInfo();
			if(info && info.type != track.type && track.getNumberOfKeyframes() )
				LiteGUI.alert("Cannot change to a property with different type if you have keyframes, types do not match.");
			else
				track.property = v;
			that.animationModified();
			that.redrawCanvas();
		}});

		widgets.addButton(null,"Convert to Node Name", { width: "30%", callback: function(){
			track.convertIDtoName();
			widgets.refresh();
		}});

		widgets.addString("Type", track.type, { disabled: true } );
		widgets.addCombo("Interpolation", track.interpolation, { disabled: !track.isInterpolable(), values: Timeline.interpolation_values, callback: function(v){ 
			if(track.interpolation == v)
				return;
			track.interpolation = v;
			that.animationModified();
		}});

		widgets.widgets_per_row = 1;

		widgets.addButtons(null,["Close"], function(v){
			dialog.close();
			return;
		});
	}

	dialog.add( widgets );
	dialog.adjustSize();
	dialog.show( null, this.root);
}

Timeline.prototype.showAddEventKeyframeDialog = function( track, time, keyframe )
{
	if(!track)
		return;

	var that = this;
	var dialog = new LiteGUI.Dialog("event keyframe",{ title:"EventKeyframe", width: 300, draggable: true, closable: true });

	var func_name = keyframe ? keyframe[1][0] : "";
	var param = keyframe ? keyframe[1][1] : "";

	var widgets = new LiteGUI.Inspector();
	var func_widget = widgets.addString("Function", func_name, function(v) { func_name = v; } );
	widgets.addString("Param", param, function(v) { param = v; } );

	var info = track.getPropertyInfo();
	if(info && info.target)
	{
		var values = [""];
		for(var i in info.target)
		{
			var f = info.target[i];
			if( typeof(f) != "function")
				continue;
			values.push(i);
		}
		widgets.addCombo("Functions", "", { values: values, callback: function(v){ 
			func_widget.setValue(v);
			func_name = v;
		}});
	}
	widgets.addButtons(null,[ keyframe ? "Update" : "Insert","Cancel"], function(v){
		if(v == "Insert")
			track.addKeyframe( time, [func_name, param] );
		else if(v == "Update")
		{
			keyframe[1][0] = func_name;
			keyframe[1][1] = param;
		}
		that.redrawCanvas();
		that.animationModified();
		dialog.close();
		return;
	});

	dialog.add( widgets );
	dialog.adjustSize();
	dialog.show( null, this.root );
}

Timeline.prototype.toggleRecording = function(v)
{
	if(!this.current_take)
		return false;

	this.recording = v;

	if( this.recording )
	{
		if(this.current_take.tracks.length == 0)
		{
			this.recording = false;
			LiteGUI.alert("No tracks found, you must create some tracks before recording.");
			return false;
		}

		//prepare
		this._recording_time = -3;
		var elem = document.createElement("div");
		elem.id = "timeline-recording-countdown";
		elem.className = "big-info-popup";
		elem.innerHTML = "REC";
		elem.style.pointerEvents = "none";
		document.body.appendChild(elem);
		//this.preview_widget.setValue(false);

		//save UNDO
		this._recording_undo = this.current_take.serialize();
		//this.addUndoTakeEdited(this.current_take);
	}
	else //stop recording
	{
		var elem = document.getElementById("timeline-recording-countdown");
		if(elem)
			elem.parentNode.removeChild(elem);
		
		//this.preview_widget.setValue(true);
		this.addUndoTakeEdited( this._recording_undo );
		delete this._recording_undo;
	}

	return this.recording;
}

Timeline.prototype.onReload = function()
{
	if(!this.current_animation)
	{
		if(LS.GlobalScene.animation)
			this.setAnimation( LS.GlobalScene.animation );
		return;
	}

	if(this.current_animation.name == LS.Animation.DEFAULT_SCENE_NAME )
		this.setAnimation( LS.GlobalScene.animation );
}


/*
Timeline.prototype.showAddEventsTrack = function()
{
	var that = this;
	var dialog = new LiteGUI.Dialog("events track",{ title:"Add Events Track", width: 500, draggable: true, closable: true });
	
	var widgets = new LiteGUI.Inspector();
	widgets.addString("Name", "", function(v){ });
	widgets.addNode("Node", "", function(v){ track.property = v; that.redrawCanvas(); });
	widgets.addNodeComponent("Component", "", {} );
	widgets.addButtons(null,["Close"], function(v){
		dialog.close();
		return;
	});

	dialog.add( widgets );
	dialog.adjustSize();
	dialog.show();
}
*/

Timeline.prototype.onItemDrop = function(e)
{
	if(!this.current_animation)
		this.onSceneAnimation(); //create scene animation


	var type = e.dataTransfer.getData("type");
	var locator = e.dataTransfer.getData("locator");
	if(!locator && e.dataTransfer.getData("text/plain"))
		locator = e.dataTransfer.getData("text/plain");

	if( locator )
	{
		var info = LS.GlobalScene.getPropertyInfo( locator );
		if(!info)
			return;

		if(info && info.type == "component" )
		{
			this.createTrack({ name: info.name, locator: locator, type: "events" });
		}
		else
		{
			var type = info.type;
			if(type == "object")
				type = "events";
			this.createTrack({ name: info.name, locator: locator, type: type });
		}
	}
}