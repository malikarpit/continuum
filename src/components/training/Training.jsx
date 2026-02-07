/**
 * Training - Hierarchical workout selection interface
 * Flow: Environment → Body Region → Muscle Group → Exercises
 * Supports full edit mode for customizing all content
 */

import { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '../../store/appStore';
import {
  TRAINING_STATUS,
  TRAINING_TYPE,
  TRAINING_MODE,
  TRAINING_SKIP_REASONS,
  BODY_REGIONS,
  MUSCLE_GROUPS,
  MUSCLE_DETAILS,
  getExercisesForMuscle,
  createExercise,
  skipExercise,
  EXERCISE_DATABASE,
} from '../../db/trainingStore';
import { isGymClosedDay, getSuggestedTrainingMode } from '../../db/phaseStore';

export default function Training() {
  const {
    training,
    isTrainingActive,
    restTimer,
    setRestTimer,
    startWorkout,
    logSet,
    finishWorkout,
    skipWorkout,
    setRestDay,
    showToast,
    currentDay,
    // Custom training data
    customTrainingData,
    updateMuscleDetails,
    updateExercises,
    addExercise,
    deleteExercise,
    settings,
    // Training Plan
    updateDayPlan,
    getTodayPlannedWorkout,
  } = useAppStore();

  // Navigation state
  const [step, setStep] = useState(1); // 1=env, 2=region, 3=muscle, 4=exercises
  const [environment, setEnvironment] = useState(null); // 'gym' | 'home'
  const [bodyRegion, setBodyRegion] = useState(null); // 'upper' | 'lower' | 'core'
  const [muscleGroup, setMuscleGroup] = useState(null); // 'chest' | 'back' | etc.

  // Gym closure state
  const [isGymClosed, setIsGymClosed] = useState(false);
  const [suggestedMode, setSuggestedMode] = useState(null);

  // Check gym closure on mount and when day changes
  useEffect(() => {
    const checkGymClosure = async () => {
      const today = new Date();
      const closed = await isGymClosedDay(today);
      setIsGymClosed(closed);
      if (closed) {
        const mode = await getSuggestedTrainingMode(today);
        setSuggestedMode(mode);
        // Auto-select home environment if gym is closed
        if (!environment) {
          setEnvironment('home');
        }
      }
    };
    checkGymClosure();
  }, [currentDay]);

  // Auto-select environment from user's primaryEquipment preference (if not already selected)
  useEffect(() => {
    if (!environment && !isGymClosed && settings?.primaryEquipment) {
      // Only auto-proceed if user has a preference set
      // setEnvironment(settings.primaryEquipment); // Uncomment to auto-skip step 1
    }
  }, [settings?.primaryEquipment, isGymClosed]);

  // Edit mode state
  const [editMode, setEditMode] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [showAddExercise, setShowAddExercise] = useState(false);
  const [newExercise, setNewExercise] = useState({ name: '', sets: 4, targetReps: 10, equipment: '', formTip: '' });

  // Training Plan state
  const [showPlanEditor, setShowPlanEditor] = useState(false);
  const [editingDay, setEditingDay] = useState(null); // 'monday', 'tuesday', etc.
  const [showExerciseEditor, setShowExerciseEditor] = useState(false);
  const [editingMuscleGroup, setEditingMuscleGroup] = useState(null); // For exercise editor

  // Workout state
  const [showSkipModal, setShowSkipModal] = useState(false);
  const [showSkipExerciseModal, setShowSkipExerciseModal] = useState(false);
  const [showNewWorkoutSelection, setShowNewWorkoutSelection] = useState(false); // Override to show selection even if workout completed
  const [currentWeight, setCurrentWeight] = useState('');

  // Auto-skip completed view on re-entry/navigation
  useEffect(() => {
    if (training?.status === TRAINING_STATUS.COMPLETED) {
      setShowNewWorkoutSelection(true);
    }
  }, []); // Run only on mount
  const [currentReps, setCurrentReps] = useState('');
  const [currentDistance, setCurrentDistance] = useState('');
  const [currentSpeed, setCurrentSpeed] = useState('');
  const [currentDuration, setCurrentDuration] = useState('');
  const [currentElevation, setCurrentElevation] = useState('');

  // Rest timer countdown
  useEffect(() => {
    if (restTimer > 0) {
      const timer = setTimeout(() => setRestTimer(restTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [restTimer, setRestTimer]);

  // Get current exercise and set
  const currentExerciseIndex = training?.currentExerciseIndex || 0;
  const currentExercise = training?.exercises?.[currentExerciseIndex];
  const completedSets = currentExercise?.completedSets?.length || 0;
  const totalExercises = training?.exercises?.length || 0;

  // Navigation functions
  const goBack = () => {
    if (step === 2) {
      setStep(1);
      setEnvironment(null);
    } else if (step === 3) {
      setStep(2);
      setBodyRegion(null);
    } else if (step === 4) {
      setStep(3);
      setMuscleGroup(null);
    } else if (step === 5) {
      // From workout view, return to main selection
      setStep(1);
      setEnvironment(null);
      setBodyRegion(null);
      setMuscleGroup(null);
    }
  };

  const selectEnvironment = (env) => {
    setEnvironment(env);
    setStep(2);
  };

  const selectBodyRegion = (region) => {
    setBodyRegion(region);
    setStep(3);
  };

  const selectMuscleGroup = (muscle) => {
    setMuscleGroup(muscle);
    setStep(4);
  };

  // Get exercises for current selection (with custom data support)
  const getSelectedExercises = () => {
    if (!environment || !muscleGroup) return [];
    const key = `${environment}_${muscleGroup}`;
    // Check for custom exercises first
    if (customTrainingData.exercises?.[key]) {
      return customTrainingData.exercises[key];
    }
    return getExercisesForMuscle(environment, muscleGroup);
  };

  // Get muscle details (with custom data support)
  const getMuscleDetailsData = () => {
    if (!muscleGroup) return null;
    // Merge custom data with defaults
    const defaults = MUSCLE_DETAILS[muscleGroup] || {};
    const custom = customTrainingData.muscleDetails?.[muscleGroup] || {};
    return {
      muscles: custom.muscles || defaults.muscles || [],
      areas: custom.areas || defaults.areas || [],
      workout: { ...defaults.workout, ...custom.workout },
      howTo: custom.howTo || defaults.howTo || [],
      mistakes: custom.mistakes || defaults.mistakes || [],
      recovery: { ...defaults.recovery, ...custom.recovery },
    };
  };

  // Get muscle group info
  const getSelectedMuscleInfo = () => {
    if (!bodyRegion || !muscleGroup) return null;
    return MUSCLE_GROUPS[bodyRegion]?.find(m => m.id === muscleGroup);
  };

  // Edit handlers
  const startEditing = (field, value) => {
    setEditingField(field);
    setEditValue(Array.isArray(value) ? value.join(', ') : value);
  };

  const saveEdit = (field) => {
    if (!muscleGroup) return;
    const details = getMuscleDetailsData();
    let newValue = editValue;

    // Handle array fields
    if (['areas', 'muscles', 'howTo', 'mistakes'].includes(field.split('.')[0])) {
      const baseField = field.split('.')[0];
      if (field.includes('.')) {
        // Editing specific item in array
        const index = parseInt(field.split('.')[1]);
        const arr = [...details[baseField]];
        arr[index] = editValue;
        newValue = arr;
        field = baseField;
      } else {
        // Converting comma-separated to array
        newValue = editValue.split(',').map(s => s.trim()).filter(Boolean);
      }
    }

    // Handle nested workout/recovery fields
    if (field.startsWith('workout.')) {
      const subField = field.split('.')[1];
      updateMuscleDetails(muscleGroup, {
        workout: { ...details.workout, [subField]: editValue }
      });
    } else if (field.startsWith('recovery.')) {
      const subField = field.split('.')[1];
      let value = editValue;
      if (subField === 'stretches') {
        value = editValue.split(',').map(s => s.trim()).filter(Boolean);
      }
      updateMuscleDetails(muscleGroup, {
        recovery: { ...details.recovery, [subField]: value }
      });
    } else {
      updateMuscleDetails(muscleGroup, { [field]: newValue });
    }

    setEditingField(null);
    setEditValue('');
    showToast('Saved!', 'success');
  };

  const handleAddListItem = (field) => {
    const details = getMuscleDetailsData();
    const arr = [...(details[field] || []), 'New item'];
    updateMuscleDetails(muscleGroup, { [field]: arr });
  };

  const handleDeleteListItem = (field, index) => {
    const details = getMuscleDetailsData();
    const arr = details[field].filter((_, i) => i !== index);
    updateMuscleDetails(muscleGroup, { [field]: arr });
  };

  const handleAddExercise = () => {
    if (!newExercise.name.trim()) return;
    const key = `${environment}_${muscleGroup}`;
    const currentExercises = customTrainingData.exercises?.[key] || getExercisesForMuscle(environment, muscleGroup);
    updateExercises(environment, muscleGroup, [...currentExercises, {
      ...newExercise,
      restSeconds: 90,
    }]);
    setNewExercise({ name: '', sets: 4, targetReps: 10, equipment: '', formTip: '' });
    setShowAddExercise(false);
    showToast('Exercise added!', 'success');
  };

  const handleDeleteExercise = (index) => {
    const key = `${environment}_${muscleGroup}`;
    const currentExercises = customTrainingData.exercises?.[key] || getExercisesForMuscle(environment, muscleGroup);
    updateExercises(environment, muscleGroup, currentExercises.filter((_, i) => i !== index));
    showToast('Exercise deleted', 'info');
  };

  // Breadcrumb path
  const getBreadcrumb = () => {
    const parts = [];
    if (environment) parts.push(environment === 'gym' ? '🏋️ Gym' : '🏠 Home');
    if (bodyRegion) parts.push(bodyRegion === 'upper' ? '🔼 Upper' : bodyRegion === 'lower' ? '🔽 Lower' : '🔥 Core');
    if (muscleGroup) {
      const info = getSelectedMuscleInfo();
      if (info) parts.push(`${info.icon} ${info.name}`);
    }
    return parts.join(' → ');
  };

  const handleStartWorkout = async () => {
    const exercises = getSelectedExercises().map(e => createExercise(e));
    if (exercises.length === 0) {
      showToast('Please add exercises to start tracking!', 'warning');
      setEditMode(true);
      setShowAddExercise(true);
      return;
    }

    // Pass null as mode for MUSCLE_FOCUSED type, and muscleGroup as focusMuscle
    await startWorkout(TRAINING_TYPE.MUSCLE_FOCUSED, null, exercises, muscleGroup);
    showToast('Workout started! Let\'s go! 💪', 'success');
  };

  const handleLogSet = async () => {
    // Require at least one metric
    if (!currentWeight && !currentReps && !currentDistance && !currentDuration) return;

    await logSet(currentExerciseIndex, {
      weight: parseFloat(currentWeight) || null,
      reps: parseInt(currentReps) || 0,
      distance: parseFloat(currentDistance) || null,
      speed: parseFloat(currentSpeed) || null,
      duration: parseFloat(currentDuration) || null,
    });

    if (completedSets + 1 < currentExercise.sets) {
      setRestTimer(currentExercise.restSeconds);
    }

    // Clear inputs (optional: keep weight if typically constant?)
    // Creating smooth flow by keeping weight, clearing others? Or clear all?
    // User often keeps weight. Let's keep weight, clear reps/others?
    // Actually standard behavior is usually clear or keep all. Let's clear reps/time.
    setCurrentReps('');
    setCurrentDistance('');
    setCurrentSpeed('');
    setCurrentDuration('');
    // Keep weight as it's often constant across sets

    showToast(`Set ${completedSets + 1} logged!`, 'success');
  };

  const handleFinishWorkout = async () => {
    await finishWorkout();
    showToast('Workout complete! Great job! 🎉', 'success');
  };

  const handleSkip = async (reason) => {
    await skipWorkout(reason);
    setShowSkipModal(false);
    showToast('Workout skipped', 'info');
  };

  const handleSkipExercise = async (reason) => {
    const dateStr = training?.date;
    if (!dateStr) return;

    await skipExercise(dateStr, currentExerciseIndex, reason);
    setShowSkipExerciseModal(false);
    showToast(`Exercise skipped: ${currentExercise?.name}`, 'info');
    await useAppStore.getState().refreshDay();
  };

  const handleRestDay = async () => {
    await setRestDay();
    showToast('Today marked as rest day 😌', 'info');
  };

  // ============================================
  // RENDER: Rest Day / Completed / Skipped States
  // ============================================

  if (training?.status === TRAINING_STATUS.REST) {
    return (
      <div className="training-view animate-fade-in">
        <div className="status-card rest">
          <div className="status-icon">😌</div>
          <h2>Rest Day</h2>
          <p className="text-secondary">Recovery is part of the process. Enjoy your day off!</p>
        </div>
        <style>{trainingStyles}</style>
      </div>
    );
  }

  if (training?.status === TRAINING_STATUS.COMPLETED && !showNewWorkoutSelection) {
    const handleStartNewWorkout = () => {
      // Reset selection state and enable override to show selection UI
      setStep(1);
      setEnvironment(null);
      setBodyRegion(null);
      setMuscleGroup(null);
      setEditMode(false);
      setShowNewWorkoutSelection(true); // Override the COMPLETED view
    };

    return (
      <div className="training-view animate-fade-in">
        <div className="status-card completed">
          <div className="status-icon">🎉</div>
          <h2>Workout Complete!</h2>
          <p className="text-secondary">
            Great job! You trained for {training.totalDuration} minutes today.
          </p>
          <div className="summary-stats mt-6">
            <div className="summary-stat">
              <div className="stat-value text-accent">{training.exercises?.length || 0}</div>
              <div className="stat-label">Exercises</div>
            </div>
            <div className="summary-stat">
              <div className="stat-value text-success">
                {training.exercises?.reduce((sum, e) => sum + (e.completedSets?.length || 0), 0) || 0}
              </div>
              <div className="stat-label">Sets</div>
            </div>
            <div className="summary-stat">
              <div className="stat-value">{training.totalDuration || 0}</div>
              <div className="stat-label">Minutes</div>
            </div>
          </div>
          <button className="btn btn-primary mt-6" onClick={handleStartNewWorkout}>
            Start New Workout
          </button>
        </div>
        <style>{trainingStyles}</style>
      </div>
    );
  }

  if (training?.status === TRAINING_STATUS.SKIPPED && !showNewWorkoutSelection) {
    const handleStartNewWorkout = () => {
      setStep(1);
      setEnvironment(null);
      setBodyRegion(null);
      setMuscleGroup(null);
      setEditMode(false);
      setShowNewWorkoutSelection(true); // Override the SKIPPED view
    };

    return (
      <div className="training-view animate-fade-in">
        <div className="status-card skipped">
          <div className="status-icon">⏭️</div>
          <h2>Workout Skipped</h2>
          <p className="text-secondary">Reason: {training.skipReason}</p>
          <p className="text-muted mt-4">Tomorrow is a new day. Consistency over perfection.</p>
          <button className="btn btn-primary mt-6" onClick={handleStartNewWorkout}>
            Start New Workout
          </button>
        </div>
        <style>{trainingStyles}</style>
      </div>
    );
  }

  // ============================================
  // RENDER: Active Workout (In Progress)
  // ============================================

  // Render in-progress UI based on persisted status (not just volatile isTrainingActive flag)
  // This allows resuming workouts after page refresh
  if (training?.status === TRAINING_STATUS.IN_PROGRESS) {
    const safeExercise = currentExercise || training.exercises?.[0];

    if (!safeExercise) {
      const handleLoadDefaultExercises = async () => {
        // Try to load default exercises based on focusMuscle
        const focusMuscle = training.focusMuscle || muscleGroup;
        const env = environment || 'gym';

        if (focusMuscle) {
          const defaultExercises = getExercisesForMuscle(env, focusMuscle);
          if (defaultExercises && defaultExercises.length > 0) {
            const exercises = defaultExercises.map(e => createExercise(e));
            const updatedTraining = { ...training, exercises };
            await useAppStore.getState().updateTraining(updatedTraining);
            showToast(`Loaded ${exercises.length} exercises for ${focusMuscle}`, 'success');
            return;
          }
        }
        showToast('No default exercises found. Please go back and select a muscle group.', 'warning');
      };

      return (
        <div className="training-view animate-fade-in">
          <div className="status-card error">
            <div className="status-icon">⚠️</div>
            <h2>No Exercises Found</h2>
            <p className="text-secondary">This workout doesn't have exercises loaded yet.</p>
            <div className="flex gap-2 mt-4 flex-wrap justify-center">
              <button className="btn btn-primary" onClick={handleLoadDefaultExercises}>
                Load Default Exercises
              </button>
              <button className="btn btn-secondary" onClick={handleFinishWorkout}>
                End Workout
              </button>
            </div>
          </div>
          <style>{trainingStyles}</style>
        </div>
      );
    }

    // Edit/Swap Mode - Show exercise selection to swap current exercise
    if (editMode) {
      return (
        <div className="training-view animate-fade-in">
          <div className="card">
            <h2 className="text-xl font-semibold mb-4">Edit / Swap Exercise</h2>
            <p className="text-secondary mb-4">
              Current: <strong>{safeExercise.name}</strong>
            </p>

            <div className="exercise-list">
              <h3 className="text-sm text-secondary mb-2">Swap with another exercise:</h3>
              {training.exercises?.filter((_, i) => i !== currentExerciseIndex).map((ex, i) => (
                <button
                  key={ex.id || i}
                  className="btn btn-ghost w-full text-left mb-2"
                  onClick={async () => {
                    // Swap exercises by moving current to later and target to current position
                    const newExercises = [...training.exercises];
                    const currentIdx = currentExerciseIndex;
                    const targetIdx = training.exercises.findIndex(e => e.id === ex.id);
                    [newExercises[currentIdx], newExercises[targetIdx]] = [newExercises[targetIdx], newExercises[currentIdx]];

                    // Update training with swapped exercises
                    const updatedTraining = { ...training, exercises: newExercises };
                    await useAppStore.getState().updateTraining(updatedTraining);
                    await useAppStore.getState().refreshDay();
                    setEditMode(false);
                    showToast(`Swapped to ${ex.name}`, 'success');
                  }}
                >
                  <span className="font-medium">{ex.name}</span>
                  <span className="text-secondary text-sm ml-2">
                    {ex.sets} × {ex.targetReps}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex gap-2 mt-4">
              <button className="btn btn-secondary flex-1" onClick={() => setEditMode(false)}>
                Cancel
              </button>
            </div>
          </div>
          <style>{trainingStyles}</style>
        </div>
      );
    }

    return (
      <div className="training-view animate-fade-in">
        <div className="workout-progress-header">
          <span className="workout-type badge badge-accent">
            {getSelectedMuscleInfo()?.name || 'Workout'}
          </span>
          <div className="flex items-center gap-2">
            <WorkoutTimer startTime={training.startTime} />
            <span className="exercise-progress text-sm text-secondary">
              {(currentExerciseIndex || 0) + 1}/{totalExercises}
            </span>
          </div>
        </div>

        <div className="progress-bar mb-6">
          <div
            className="progress-bar-fill"
            style={{ width: `${((currentExerciseIndex || 0) / (totalExercises || 1)) * 100}%` }}
          />
        </div>

        <div className="exercise-card card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <h2 className="exercise-name" style={{ margin: 0 }}>{safeExercise.name}</h2>
            <span style={{
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '0.7rem',
              textTransform: 'uppercase',
              background: safeExercise.exerciseType === 'cardio' ? 'var(--warning-color)'
                : safeExercise.exerciseType === 'isometric' ? 'var(--info-color)'
                  : 'var(--primary-color)',
              color: 'white',
            }}>
              {safeExercise.exerciseType || 'strength'}
            </span>
          </div>
          <p className="last-week text-secondary">
            {safeExercise.exerciseType === 'cardio'
              ? `Target: ${safeExercise.duration || 30} min${safeExercise.speed ? ` @ ${safeExercise.speed} km/h` : ''}${safeExercise.elevation ? ` • ${safeExercise.elevation}% incline` : ''}`
              : safeExercise.exerciseType === 'isometric'
                ? `Target: ${safeExercise.sets || 3} holds × ${safeExercise.holdTime || 60} seconds`
                : `Target: ${safeExercise.sets || 4} sets × ${safeExercise.targetReps || 10} reps${safeExercise.weight ? ` @ ${safeExercise.weight}kg` : ''}`
            }
          </p>

          {/* Set/Hold indicators - show for strength, bodyweight, isometric */}
          {safeExercise.exerciseType !== 'cardio' && (
            <div className="set-indicators">
              {Array.from({ length: safeExercise.sets || 3 }).map((_, i) => (
                <div
                  key={i}
                  className={`set-indicator ${i < completedSets ? 'completed' : i === completedSets ? 'current' : ''}`}
                >
                  {i + 1}
                </div>
              ))}
            </div>
          )}

          {restTimer > 0 && (
            <div className="rest-timer">
              <div className="rest-timer-label">REST TIME</div>
              <div className="rest-timer-value">
                {Math.floor(restTimer / 60)}:{(restTimer % 60).toString().padStart(2, '0')}
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setRestTimer(0)}>
                Skip Rest
              </button>
            </div>
          )}

          {restTimer === 0 && completedSets < (safeExercise.sets || 1) && (
            <div className="set-input">
              <h3 className="set-number">
                {safeExercise.exerciseType === 'cardio'
                  ? 'Log Cardio Session'
                  : safeExercise.exerciseType === 'isometric'
                    ? `Hold ${completedSets + 1} of ${safeExercise.sets || 3}`
                    : `Set ${completedSets + 1}`
                }
              </h3>

              {/* Strength/Bodyweight: Weight and Reps */}
              {(safeExercise.exerciseType === 'strength' || safeExercise.exerciseType === 'bodyweight' || !safeExercise.exerciseType) && (
                <div className="input-row">
                  {safeExercise.exerciseType !== 'bodyweight' && (
                    <div className="input-group">
                      <label className="label">Weight (kg)</label>
                      <input
                        type="number"
                        className="input"
                        placeholder={safeExercise.weight || '0'}
                        value={currentWeight}
                        onChange={e => setCurrentWeight(e.target.value)}
                      />
                    </div>
                  )}
                  <div className="input-group">
                    <label className="label">Reps</label>
                    <input
                      type="number"
                      className="input"
                      placeholder={safeExercise.targetReps}
                      value={currentReps}
                      onChange={e => setCurrentReps(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* Cardio: Duration, Speed, Distance, Elevation */}
              {safeExercise.exerciseType === 'cardio' && (
                <div className="cardio-inputs">
                  <div className="input-row">
                    <div className="input-group">
                      <label className="label">Duration (min)</label>
                      <input
                        type="number"
                        className="input"
                        placeholder={safeExercise.duration || '30'}
                        value={currentDuration}
                        onChange={e => setCurrentDuration(e.target.value)}
                      />
                    </div>
                    <div className="input-group">
                      <label className="label">Distance (km)</label>
                      <input
                        type="number"
                        className="input"
                        placeholder={safeExercise.distance || '0'}
                        value={currentDistance}
                        onChange={e => setCurrentDistance(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="input-row mt-2">
                    <div className="input-group">
                      <label className="label">Speed (km/h)</label>
                      <input
                        type="number"
                        className="input"
                        placeholder={safeExercise.speed || '0'}
                        value={currentSpeed}
                        onChange={e => setCurrentSpeed(e.target.value)}
                      />
                    </div>
                    <div className="input-group">
                      <label className="label">Incline (%)</label>
                      <input
                        type="number"
                        className="input"
                        placeholder={safeExercise.elevation || '0'}
                        value={currentElevation || ''}
                        onChange={e => setCurrentElevation && setCurrentElevation(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Isometric: Hold Time */}
              {safeExercise.exerciseType === 'isometric' && (
                <div className="input-row">
                  <div className="input-group">
                    <label className="label">Hold Time (seconds)</label>
                    <input
                      type="number"
                      className="input"
                      placeholder={safeExercise.holdTime || '60'}
                      value={currentDuration}
                      onChange={e => setCurrentDuration(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <button
                className="btn btn-primary w-full mt-4"
                onClick={handleLogSet}
                disabled={
                  safeExercise.exerciseType === 'cardio'
                    ? !currentDuration
                    : safeExercise.exerciseType === 'isometric'
                      ? !currentDuration
                      : !currentReps
                }
              >
                {safeExercise.exerciseType === 'cardio'
                  ? 'Complete Cardio ✓'
                  : safeExercise.exerciseType === 'isometric'
                    ? `Complete Hold ${completedSets + 1} ✓`
                    : `Complete Set ${completedSets + 1} ✓`
                }
              </button>

              {/* Skip to next exercise */}
              {(completedSets > 0 || safeExercise.exerciseType === 'cardio') && (
                <button
                  className="btn btn-ghost w-full mt-2"
                  onClick={() => setShowSkipExerciseModal(true)}
                  style={{ fontSize: '0.85rem' }}
                >
                  Skip remaining → Next exercise
                </button>
              )}
            </div>
          )}

          {safeExercise.completedSets?.length > 0 && (
            <div className="history-section mt-6">
              <h3 className="section-subtitle">Current Session</h3>
              <div className="history-list">
                {safeExercise.completedSets.map((set, i) => (
                  <div key={i} className="history-item">
                    <span className="set-num">#{set.setNumber}</span>
                    <span className="set-data">
                      {set.weight > 0 && `${set.weight}kg × `}
                      {set.reps} reps
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {safeExercise.formTip && (
            <div className="form-tip mt-4">
              <span className="tip-icon">💡</span>
              <span>{safeExercise.formTip}</span>
            </div>
          )}
        </div>

        <div className="action-buttons-row">
          <button className="btn btn-secondary flex-1" onClick={() => setEditMode(true)}>
            Edit / Swap
          </button>
          {currentExerciseIndex === totalExercises - 1 && completedSets >= safeExercise.sets ? (
            <button className="btn btn-success flex-1" onClick={handleFinishWorkout}>
              Finish Workout 🎉
            </button>
          ) : (
            <button className="btn btn-primary w-full" onClick={handleFinishWorkout}>
              End Workout
            </button>
          )}
        </div>

        {showSkipModal && (
          <SkipWorkoutModal onClose={() => setShowSkipModal(false)} onSkip={handleSkip} />
        )}

        {showSkipExerciseModal && (
          <SkipExerciseModal
            exerciseName={currentExercise?.name}
            onClose={() => setShowSkipExerciseModal(false)}
            onSkip={handleSkipExercise}
          />
        )}

        <style>{trainingStyles}</style>
      </div>
    );
  }

  // ============================================
  // RENDER: Workout Selection (Hierarchical)
  // ============================================

  return (
    <div className="training-view animate-fade-in">
      <header className="view-header">
        <div className="header-row">
          <div>
            <h1 className="view-title">Training</h1>
            <p className="view-subtitle text-secondary">
              {step === 1 && 'Choose your workout environment'}
              {step === 2 && 'Select body region'}
              {step === 3 && 'Pick a muscle group to train'}
              {step === 4 && 'Review and start your workout'}
            </p>
          </div>
          {step === 1 && (
            <div className="quick-actions-top">
              <button className="btn-compact rest" onClick={handleRestDay}>
                <span className="btn-main">😌 Rest Day</span>
                <span className="btn-subtext">No workout planned</span>
              </button>
              <button className="btn-compact skip" onClick={() => setShowSkipModal(true)}>
                <span className="btn-main">⏭️ Skip Today</span>
                <span className="btn-subtext">Had plans, skipping</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Breadcrumb */}
      {step > 1 && (
        <div className="breadcrumb-container">
          <button className="btn-back" onClick={goBack}>
            ← Back
          </button>
          <span className="breadcrumb-path">{getBreadcrumb()}</span>
        </div>
      )}

      {/* Step 1: Environment Selection */}
      {step === 1 && (
        <section className="selection-section env-section">
          {/* Training Stats Summary */}
          <div className="training-stats-summary">
            <div className="stat-item">
              <span className="stat-value">{currentDay?.workoutsThisWeek || 0}</span>
              <span className="stat-label">This Week</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{training?.averageDuration || '--'}m</span>
              <span className="stat-label">Avg Time</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{settings?.weeklyWorkoutTarget || 4}</span>
              <span className="stat-label">Target</span>
            </div>
          </div>

          {/* Today's Planned Workout (if plan is set) */}
          {(() => {
            const plannedExercises = getTodayPlannedWorkout();
            // Check if we have planned exercises for today (now an array)
            if (Array.isArray(plannedExercises) && plannedExercises.length > 0) {
              // Get exercise types summary
              const exerciseTypes = [...new Set(plannedExercises.map(ex => ex.exerciseType || 'strength'))];
              const typeIcons = {
                strength: '🏋️',
                cardio: '🏃',
                isometric: '🧘',
                bodyweight: '💪'
              };

              return (
                <div className="planned-workout-card">
                  <div className="planned-header">
                    <span className="planned-icon">{typeIcons[exerciseTypes[0]] || '💪'}</span>
                    <div className="planned-info">
                      <strong>Today's Workout</strong>
                      <span className="planned-meta">
                        {plannedExercises.length} exercise{plannedExercises.length !== 1 ? 's' : ''} planned
                        {exerciseTypes.length > 1 && ` • ${exerciseTypes.map(t => typeIcons[t]).join(' ')}`}
                      </span>
                      <div className="repeat-badge" style={{ display: 'inline-flex', marginLeft: '0.5rem', marginTop: '0.25rem' }}>
                        ↻ Repeats Weekly
                      </div>
                    </div>
                  </div>
                  {/* Show exercise list preview */}
                  <div className="planned-exercises-preview" style={{
                    marginTop: '0.75rem',
                    padding: '0.75rem',
                    background: 'var(--surface-color)',
                    borderRadius: '6px',
                    maxHeight: '120px',
                    overflowY: 'auto'
                  }}>
                    {plannedExercises.slice(0, 4).map((ex, idx) => (
                      <div key={ex.id || idx} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.25rem 0',
                        fontSize: '0.85rem'
                      }}>
                        <span style={{ opacity: 0.6 }}>{idx + 1}.</span>
                        <span>{ex.name}</span>
                        <span style={{ marginLeft: 'auto', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                          {ex.exerciseType === 'cardio'
                            ? `${ex.duration || 30}min`
                            : ex.exerciseType === 'isometric'
                              ? `${ex.sets || 3}×${ex.holdTime || 60}s`
                              : `${ex.sets || 4}×${ex.targetReps || 10}`
                          }
                        </span>
                      </div>
                    ))}
                    {plannedExercises.length > 4 && (
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                        +{plannedExercises.length - 4} more...
                      </div>
                    )}
                  </div>
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ marginTop: '0.75rem', width: '10%' }}
                    onClick={async () => {
                      // Start workout with the planned exercises
                      await startWorkout('strength', 'standard', plannedExercises, null);
                    }}
                  >
                    Start Planned Workout →
                  </button>
                </div>
              );
            }
            return null;
          })()}

          {/* Weekly Plan Grid */}
          <div className="weekly-plan-section">
            <div className="weekly-plan-header">
              <span className="section-title">📅 Weekly Plan</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowPlanEditor(true)}>
                Edit
              </button>
            </div>
            <div className="weekly-plan-grid">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((dayShort, idx) => {
                const dayFull = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'][idx];
                const dayExercises = settings?.trainingPlan?.weeklySchedule?.[dayFull];
                const exercises = Array.isArray(dayExercises) ? dayExercises : [];
                const isToday = new Date().getDay() === (idx + 1) % 7;
                const hasExercises = exercises.length > 0;

                // Get first exercise type for icon
                const firstType = exercises[0]?.exerciseType || 'strength';
                const typeIcons = { strength: '🏋️', cardio: '🏃', isometric: '🧘', bodyweight: '💪' };

                return (
                  <div
                    key={dayFull}
                    className={`plan-day ${isToday ? 'today' : ''} ${hasExercises ? 'has-plan' : ''}`}
                    onClick={() => {
                      setEditingDay(dayFull);
                      setShowPlanEditor(true);
                    }}
                  >
                    <span className="day-label">{dayShort}</span>
                    <span className="day-icon">
                      {hasExercises ? typeIcons[firstType] || '💪' : '—'}
                    </span>
                    <span className="day-focus">
                      {hasExercises ? `${exercises.length}` : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Gym Closure Banner */}
          {isGymClosed && (
            <div className="gym-closure-banner">
              <span className="closure-icon">🏠</span>
              <div className="closure-content">
                <strong>Home Workout Day</strong>
                <p>Gym is closed today ({suggestedMode === 'bodyweight' ? 'Bodyweight only' : 'Light cardio recommended'})</p>
              </div>
            </div>
          )}
          <div className="env-buttons-centered">
            <button
              className={`env-btn-large gym ${isGymClosed ? 'disabled' : ''}`}
              onClick={() => !isGymClosed && selectEnvironment('gym')}
              disabled={isGymClosed}
            >
              <span className="env-icon-large">🏋️</span>
              <span className="env-label-large">Gym Workout</span>
              <span className="env-desc">{isGymClosed ? 'Unavailable today' : 'With equipment'}</span>
            </button>
            <button
              className={`env-btn-large home ${isGymClosed ? 'recommended' : ''}`}
              onClick={() => selectEnvironment('home')}
            >
              <span className="env-icon-large">🏠</span>
              <span className="env-label-large">Home Workout</span>
              <span className="env-desc">{isGymClosed ? 'Recommended' : 'No equipment'}</span>
              {isGymClosed && <span className="recommended-badge">Suggested</span>}
            </button>
          </div>
        </section>
      )}

      {/* Step 2: Body Region Selection */}
      {step === 2 && (
        <section className="selection-section">
          <div className="region-buttons">
            <div className="region-btn-container">
              <button className="region-btn" onClick={() => selectBodyRegion('upper')}>
                <span className="region-icon">🔼</span>
                <span className="region-label">Upper Body</span>
                <span className="region-desc">Chest, Back, Shoulders, Arms</span>
              </button>
              <button
                className="btn-edit-exercises"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingMuscleGroup('upper');
                  setShowExerciseEditor(true);
                }}
                title="Edit exercises for upper body"
              >
                ✏️
              </button>
            </div>
            <div className="region-btn-container">
              <button className="region-btn" onClick={() => selectBodyRegion('lower')}>
                <span className="region-icon">🔽</span>
                <span className="region-label">Lower Body</span>
                <span className="region-desc">Quads, Hamstrings, Glutes, Calves</span>
              </button>
              <button
                className="btn-edit-exercises"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingMuscleGroup('lower');
                  setShowExerciseEditor(true);
                }}
                title="Edit exercises for lower body"
              >
                ✏️
              </button>
            </div>
            <div className="region-btn-container">
              <button className="region-btn" onClick={() => selectBodyRegion('core')}>
                <span className="region-icon">🔥</span>
                <span className="region-label">Core</span>
                <span className="region-desc">Abs, Obliques, Lower Back</span>
              </button>
              <button
                className="btn-edit-exercises"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingMuscleGroup('core');
                  setShowExerciseEditor(true);
                }}
                title="Edit exercises for core"
              >
                ✏️
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Step 3: Muscle Group Selection (EDITABLE) */}
      {step === 3 && bodyRegion && (() => {
        // Get muscle groups - check for custom first, then defaults
        const getMuscleGroupsForRegion = () => {
          if (customTrainingData.muscleGroups?.[bodyRegion]) {
            return customTrainingData.muscleGroups[bodyRegion];
          }
          return MUSCLE_GROUPS[bodyRegion] || [];
        };
        const muscles = getMuscleGroupsForRegion();

        return (
          <section className="selection-section">
            {/* Edit Mode Toggle */}
            <div className="edit-mode-toggle">
              <button
                className={`btn-edit-mode ${editMode ? 'active' : ''}`}
                onClick={() => setEditMode(!editMode)}
              >
                {editMode ? '✓ Done Editing' : '✏️ Edit Mode'}
              </button>
            </div>

            <div className="muscle-grid">
              {muscles.map((muscle, index) => (
                <div key={muscle.id} className={`muscle-btn-wrapper ${editMode ? 'editing' : ''}`}>
                  {editMode && (
                    <button
                      className="btn-delete-muscle"
                      onClick={(e) => {
                        e.stopPropagation();
                        const updated = muscles.filter((_, i) => i !== index);
                        const { updateMuscleGroups } = useAppStore.getState();
                        updateMuscleGroups(bodyRegion, updated);
                        showToast('Muscle group deleted', 'info');
                      }}
                    >
                      ×
                    </button>
                  )}
                  <button
                    className="muscle-btn"
                    onClick={() => !editMode && selectMuscleGroup(muscle.id)}
                  >
                    {editMode && editingField === `muscle.${index}.icon` ? (
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => {
                          const updated = [...muscles];
                          updated[index] = { ...updated[index], icon: editValue };
                          const { updateMuscleGroups } = useAppStore.getState();
                          updateMuscleGroups(bodyRegion, updated);
                          setEditingField(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const updated = [...muscles];
                            updated[index] = { ...updated[index], icon: editValue };
                            const { updateMuscleGroups } = useAppStore.getState();
                            updateMuscleGroups(bodyRegion, updated);
                            setEditingField(null);
                          }
                        }}
                        autoFocus
                        className="inline-input icon-input"
                      />
                    ) : (
                      <span
                        className={`muscle-icon ${editMode ? 'editable-icon' : ''}`}
                        onClick={(e) => {
                          if (editMode) {
                            e.stopPropagation();
                            setEditingField(`muscle.${index}.icon`);
                            setEditValue(muscle.icon);
                          }
                        }}
                      >
                        {muscle.icon}
                      </span>
                    )}

                    {editMode && editingField === `muscle.${index}.name` ? (
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => {
                          const updated = [...muscles];
                          updated[index] = { ...updated[index], name: editValue };
                          const { updateMuscleGroups } = useAppStore.getState();
                          updateMuscleGroups(bodyRegion, updated);
                          setEditingField(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const updated = [...muscles];
                            updated[index] = { ...updated[index], name: editValue };
                            const { updateMuscleGroups } = useAppStore.getState();
                            updateMuscleGroups(bodyRegion, updated);
                            setEditingField(null);
                          }
                        }}
                        autoFocus
                        className="inline-input"
                      />
                    ) : (
                      <span
                        className={`muscle-label ${editMode ? 'editable-text' : ''}`}
                        onClick={(e) => {
                          if (editMode) {
                            e.stopPropagation();
                            setEditingField(`muscle.${index}.name`);
                            setEditValue(muscle.name);
                          }
                        }}
                      >
                        {muscle.name}
                      </span>
                    )}

                    {editMode && editingField === `muscle.${index}.description` ? (
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => {
                          const updated = [...muscles];
                          updated[index] = { ...updated[index], description: editValue };
                          const { updateMuscleGroups } = useAppStore.getState();
                          updateMuscleGroups(bodyRegion, updated);
                          setEditingField(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const updated = [...muscles];
                            updated[index] = { ...updated[index], description: editValue };
                            const { updateMuscleGroups } = useAppStore.getState();
                            updateMuscleGroups(bodyRegion, updated);
                            setEditingField(null);
                          }
                        }}
                        autoFocus
                        className="inline-input"
                      />
                    ) : (
                      <span
                        className={`muscle-desc ${editMode ? 'editable-text' : ''}`}
                        onClick={(e) => {
                          if (editMode) {
                            e.stopPropagation();
                            setEditingField(`muscle.${index}.description`);
                            setEditValue(muscle.description);
                          }
                        }}
                      >
                        {muscle.description}
                      </span>
                    )}
                  </button>
                </div>
              ))}

              {/* Add New Muscle Group Button */}
              {editMode && (
                <button
                  className="muscle-btn add-muscle-btn"
                  onClick={() => {
                    const newMuscleId = `custom_${Date.now()}`;
                    const newMuscle = {
                      id: newMuscleId,
                      name: 'New Muscle',
                      icon: '💪',
                      description: 'Custom muscle group'
                    };
                    const updated = [...muscles, newMuscle];
                    const { updateMuscleGroups, updateMuscleDetails } = useAppStore.getState();
                    updateMuscleGroups(bodyRegion, updated);
                    // Create template for new muscle
                    updateMuscleDetails(newMuscleId, {
                      muscles: ['Primary muscle', 'Secondary muscle'],
                      areas: ['Area 1', 'Area 2'],
                      workout: { sets: '3-4', reps: '8-12', tempo: '2 sec down, 1 sec up', rest: '60-90 sec' },
                      howTo: ['Keep proper form', 'Control the movement', 'Full range of motion'],
                      mistakes: ['Rushing reps', 'Using too much weight', 'Poor posture'],
                      recovery: {
                        stretches: ['Stretch 1 – 30 sec', 'Stretch 2 – 30 sec'],
                        restDays: '48-72 hours',
                        tips: 'Rest and recover properly'
                      }
                    });
                    showToast('New muscle group added!', 'success');
                  }}
                >
                  <span className="muscle-icon">➕</span>
                  <span className="muscle-label">Add Muscle Group</span>
                  <span className="muscle-desc">Create custom</span>
                </button>
              )}
            </div>
          </section>
        );
      })()}

      {/* Step 4: Exercise Preview with Detailed Info (EDITABLE) */}
      {step === 4 && muscleGroup && (() => {
        const details = getMuscleDetailsData();
        const exercises = getSelectedExercises();
        const muscleInfo = getSelectedMuscleInfo();

        return (
          <section className="selection-section detail-view">
            {/* Edit Mode Toggle */}
            <div className="edit-mode-toggle">
              <button
                className={`btn-edit-mode ${editMode ? 'active' : ''}`}
                onClick={() => setEditMode(!editMode)}
              >
                {editMode ? '✓ Done Editing' : '✏️ Edit Mode'}
              </button>
            </div>

            {/* Muscle Header + Start Button */}
            <div className="muscle-header-row">
              <div className="muscle-header">
                <span className="muscle-header-icon">{muscleInfo?.icon}</span>
                <h2 className="muscle-header-name">{muscleInfo?.name}</h2>
              </div>
              <button className="btn btn-primary btn-start-top" onClick={handleStartWorkout}>
                Start Workout 💪
              </button>
            </div>

            {/* Muscle Info Card */}
            {details && (
              <div className="muscle-info-card card">
                {/* Target Areas */}
                <div className="info-section">
                  <h4 className="info-title">
                    🎯 Target Areas
                    {editMode && (
                      <button className="btn-add-sm" onClick={() => handleAddListItem('areas')}>+</button>
                    )}
                  </h4>
                  <div className="tags-row">
                    {details.areas.map((area, i) => (
                      <span key={i} className={`tag ${editMode ? 'editable' : ''}`}>
                        {editMode && editingField === `areas.${i}` ? (
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => saveEdit(`areas.${i}`)}
                            onKeyDown={(e) => e.key === 'Enter' && saveEdit(`areas.${i}`)}
                            autoFocus
                            className="inline-input"
                          />
                        ) : (
                          <span onClick={() => editMode && startEditing(`areas.${i}`, area)}>{area}</span>
                        )}
                        {editMode && (
                          <button className="btn-delete-tag" onClick={() => handleDeleteListItem('areas', i)}>×</button>
                        )}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Muscles Worked */}
                <div className="info-section">
                  <h4 className="info-title">💪 Muscles Worked</h4>
                  {editMode && editingField === 'muscles' ? (
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={() => saveEdit('muscles')}
                      onKeyDown={(e) => e.key === 'Enter' && saveEdit('muscles')}
                      autoFocus
                      className="inline-input full"
                      placeholder="Comma-separated muscle names"
                    />
                  ) : (
                    <p
                      className={`info-text ${editMode ? 'editable-text' : ''}`}
                      onClick={() => editMode && startEditing('muscles', details.muscles)}
                    >
                      {details.muscles.join(', ')}
                    </p>
                  )}
                </div>

                {/* Workout Prescription */}
                <div className="info-section">
                  <h4 className="info-title">📋 Workout Prescription</h4>
                  <div className="prescription-grid">
                    {['sets', 'reps', 'tempo', 'rest'].map(field => (
                      <div key={field} className="prescription-item">
                        <span className="prescription-label">{field.charAt(0).toUpperCase() + field.slice(1)}</span>
                        {editMode && editingField === `workout.${field}` ? (
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => saveEdit(`workout.${field}`)}
                            onKeyDown={(e) => e.key === 'Enter' && saveEdit(`workout.${field}`)}
                            autoFocus
                            className="inline-input"
                          />
                        ) : (
                          <span
                            className={`prescription-value ${editMode ? 'editable-text' : ''}`}
                            onClick={() => editMode && startEditing(`workout.${field}`, details.workout[field])}
                          >
                            {details.workout[field]}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Exercises List */}
            <div className="exercises-section">
              <h3 className="section-label">
                {environment === 'gym' ? '🏋️' : '🏠'} {environment === 'gym' ? 'Gym' : 'Home'} Exercises
                {editMode && (
                  <button className="btn-add" onClick={() => setShowAddExercise(true)}>+ Add Exercise</button>
                )}
              </h3>
              <div className="exercise-list card">
                {exercises.length === 0 && (
                  <div className="empty-state text-center p-6">
                    <p className="text-secondary mb-4">No exercises added yet for this muscle group.</p>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => {
                        setEditMode(true);
                        setShowAddExercise(true);
                      }}
                    >
                      + Add First Exercise
                    </button>
                  </div>
                )}
                {exercises.map((exercise, i) => (
                  <div key={i} className="exercise-preview-item">
                    <span className="exercise-number">{i + 1}</span>
                    <div className="exercise-info">
                      <span className="exercise-name">{exercise.name}</span>
                      {exercise.equipment && (
                        <span className="exercise-equipment">{exercise.equipment}</span>
                      )}
                      {exercise.formTip && (
                        <span className="exercise-tip">💡 {exercise.formTip}</span>
                      )}
                    </div>
                    <span className="exercise-sets">
                      {exercise.sets} × {exercise.targetReps}
                    </span>
                    {editMode && (
                      <button className="btn-delete-item" onClick={() => handleDeleteExercise(i)}>🗑️</button>
                    )}
                  </div>
                ))}
              </div>

              {/* Add Exercise Form */}
              {showAddExercise && (
                <div className="add-exercise-form card">
                  <h4>Add New Exercise</h4>
                  <div className="form-grid">
                    <input
                      type="text"
                      placeholder="Exercise name"
                      value={newExercise.name}
                      onChange={(e) => setNewExercise({ ...newExercise, name: e.target.value })}
                      className="input"
                    />
                    <input
                      type="number"
                      placeholder="Sets"
                      value={newExercise.sets}
                      onChange={(e) => setNewExercise({ ...newExercise, sets: parseInt(e.target.value) || 4 })}
                      className="input"
                    />
                    <input
                      type="number"
                      placeholder="Reps"
                      value={newExercise.targetReps}
                      onChange={(e) => setNewExercise({ ...newExercise, targetReps: parseInt(e.target.value) || 10 })}
                      className="input"
                    />
                    <input
                      type="text"
                      placeholder="Equipment (optional)"
                      value={newExercise.equipment}
                      onChange={(e) => setNewExercise({ ...newExercise, equipment: e.target.value })}
                      className="input"
                    />
                    <input
                      type="text"
                      placeholder="Form tip (optional)"
                      value={newExercise.formTip}
                      onChange={(e) => setNewExercise({ ...newExercise, formTip: e.target.value })}
                      className="input full-width"
                    />
                  </div>
                  <div className="form-actions">
                    <button className="btn btn-secondary" onClick={() => setShowAddExercise(false)}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleAddExercise}>Add Exercise</button>
                  </div>
                </div>
              )}
            </div>

            {/* How To Section */}
            {details && (
              <div className="info-card card">
                <h4 className="info-title">
                  ✅ How To Do It Right
                  {editMode && (
                    <button className="btn-add-sm" onClick={() => handleAddListItem('howTo')}>+</button>
                  )}
                </h4>
                <ul className="info-list">
                  {details.howTo.map((tip, i) => (
                    <li key={i} className={editMode ? 'editable-item' : ''}>
                      {editMode && editingField === `howTo.${i}` ? (
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => saveEdit(`howTo.${i}`)}
                          onKeyDown={(e) => e.key === 'Enter' && saveEdit(`howTo.${i}`)}
                          autoFocus
                          className="inline-input full"
                        />
                      ) : (
                        <span onClick={() => editMode && startEditing(`howTo.${i}`, tip)}>{tip}</span>
                      )}
                      {editMode && (
                        <button className="btn-delete-inline" onClick={() => handleDeleteListItem('howTo', i)}>×</button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Common Mistakes */}
            {details && (
              <div className="info-card card warning">
                <h4 className="info-title">
                  ⚠️ Common Mistakes
                  {editMode && (
                    <button className="btn-add-sm" onClick={() => handleAddListItem('mistakes')}>+</button>
                  )}
                </h4>
                <ul className="info-list">
                  {details.mistakes.map((mistake, i) => (
                    <li key={i} className={editMode ? 'editable-item' : ''}>
                      {editMode && editingField === `mistakes.${i}` ? (
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => saveEdit(`mistakes.${i}`)}
                          onKeyDown={(e) => e.key === 'Enter' && saveEdit(`mistakes.${i}`)}
                          autoFocus
                          className="inline-input full"
                        />
                      ) : (
                        <span onClick={() => editMode && startEditing(`mistakes.${i}`, mistake)}>{mistake}</span>
                      )}
                      {editMode && (
                        <button className="btn-delete-inline" onClick={() => handleDeleteListItem('mistakes', i)}>×</button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Recovery Info */}
            {details && (
              <div className="info-card card recovery">
                <h4 className="info-title">🧘 Recovery</h4>
                <div className="recovery-content">
                  <div className="recovery-section">
                    <span className="recovery-label">Stretches:</span>
                    {editMode && editingField === 'recovery.stretches' ? (
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => saveEdit('recovery.stretches')}
                        onKeyDown={(e) => e.key === 'Enter' && saveEdit('recovery.stretches')}
                        autoFocus
                        className="inline-input full"
                        placeholder="Comma-separated stretches"
                      />
                    ) : (
                      <span
                        className={`recovery-value ${editMode ? 'editable-text' : ''}`}
                        onClick={() => editMode && startEditing('recovery.stretches', details.recovery.stretches)}
                      >
                        {details.recovery.stretches?.join(', ')}
                      </span>
                    )}
                  </div>
                  <div className="recovery-section">
                    <span className="recovery-label">Rest Days:</span>
                    {editMode && editingField === 'recovery.restDays' ? (
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => saveEdit('recovery.restDays')}
                        onKeyDown={(e) => e.key === 'Enter' && saveEdit('recovery.restDays')}
                        autoFocus
                        className="inline-input full"
                      />
                    ) : (
                      <span
                        className={`recovery-value ${editMode ? 'editable-text' : ''}`}
                        onClick={() => editMode && startEditing('recovery.restDays', details.recovery.restDays)}
                      >
                        {details.recovery.restDays}
                      </span>
                    )}
                  </div>
                  <div className="recovery-section">
                    <span className="recovery-label">Tips:</span>
                    {editMode && editingField === 'recovery.tips' ? (
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => saveEdit('recovery.tips')}
                        onKeyDown={(e) => e.key === 'Enter' && saveEdit('recovery.tips')}
                        autoFocus
                        className="inline-input full"
                      />
                    ) : (
                      <span
                        className={`recovery-value ${editMode ? 'editable-text' : ''}`}
                        onClick={() => editMode && startEditing('recovery.tips', details.recovery.tips)}
                      >
                        {details.recovery.tips}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}


          </section>
        );
      })()}

      {showSkipModal && (
        <SkipWorkoutModal onClose={() => setShowSkipModal(false)} onSkip={handleSkip} />
      )}

      {/* Weekly Plan Editor Modal */}
      {showPlanEditor && (
        <WeeklyPlanEditorModal
          settings={settings}
          editingDay={editingDay}
          onSave={async (day, config) => {
            await updateDayPlan(day, config);
            showToast(`${day.charAt(0).toUpperCase() + day.slice(1)} updated!`, 'success');
          }}
          onClose={() => {
            setShowPlanEditor(false);
            setEditingDay(null);
          }}
        />
      )}

      {/* Exercise Editor Modal */}
      {showExerciseEditor && (
        <ExerciseEditorModal
          region={editingMuscleGroup}
          environment={environment || 'gym'}
          onClose={() => {
            setShowExerciseEditor(false);
            setEditingMuscleGroup(null);
          }}
        />
      )}

      <style>{trainingStyles}</style>
    </div>
  );
}

// Skip Workout Modal
function SkipWorkoutModal({ onClose, onSkip }) {
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const finalReason = reason === 'Custom reason' ? customReason : reason;
    if (!finalReason.trim()) return;
    onSkip(finalReason);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Skip Workout</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p className="text-secondary mb-4">
              Please provide a reason. No judgment — just honest tracking.
            </p>
            <div className="reason-options">
              {TRAINING_SKIP_REASONS.map(r => (
                <button
                  key={r}
                  type="button"
                  className={`reason-btn ${reason === r ? 'active' : ''}`}
                  onClick={() => setReason(r)}
                >
                  {r}
                </button>
              ))}
            </div>
            {reason === 'Custom reason' && (
              <input
                type="text"
                className="input mt-4"
                placeholder="Enter your reason..."
                value={customReason}
                onChange={e => setCustomReason(e.target.value)}
              />
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!reason || (reason === 'Custom reason' && !customReason.trim())}
            >
              Skip Workout
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Weekly Plan Editor Modal - Edit the weekly training schedule
// Now supports adding multiple exercises from any muscle group for each day
function WeeklyPlanEditorModal({ settings, editingDay, onSave, onClose }) {
  const [selectedDay, setSelectedDay] = useState(editingDay || 'monday');

  // Get current exercises for selected day (now an array)
  const currentExercises = settings?.trainingPlan?.weeklySchedule?.[selectedDay] || [];
  const [exercises, setExercises] = useState(
    Array.isArray(currentExercises) ? currentExercises : []
  );

  // For adding new exercises
  const [showAddExercise, setShowAddExercise] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState('upper');
  const [selectedMuscle, setSelectedMuscle] = useState('');
  const [selectedEnvironment, setSelectedEnvironment] = useState('gym');
  const [exerciseType, setExerciseType] = useState('strength');
  // New state for configuring exercise details
  const [configuringExercise, setConfiguringExercise] = useState(null);
  const [editingIndex, setEditingIndex] = useState(null);

  // Update exercises when day changes
  useEffect(() => {
    const dayExercises = settings?.trainingPlan?.weeklySchedule?.[selectedDay];
    setExercises(Array.isArray(dayExercises) ? dayExercises : []);
  }, [selectedDay, settings]);

  const allMuscles = {
    upper: MUSCLE_GROUPS.upper,
    lower: MUSCLE_GROUPS.lower,
    core: MUSCLE_GROUPS.core,
  };

  // Get available exercises based on selection
  const availableExercises = selectedMuscle
    ? getExercisesForMuscle(selectedEnvironment, selectedMuscle)
    : [];

  // Handle selecting an exercise to configure
  const handleSelectExercise = (exercise) => {
    setConfiguringExercise({
      ...exercise,
      exerciseType: exercise.exerciseType || exerciseType,
      // Ensure default values exist
      sets: exercise.sets || 4,
      targetReps: exercise.targetReps || 10,
      weight: exercise.weight || '',
      duration: exercise.duration || 30,
      speed: exercise.speed || '',
      distance: exercise.distance || '',
      incline: exercise.incline || '',
      holdTime: exercise.holdTime || 60,
      id: exercise.id || `ex_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    });
  };

  // Handle confirming the configured exercise
  const handleConfirmExercise = () => {
    if (!configuringExercise) return;

    if (editingIndex !== null) {
      // Update existing
      const updated = [...exercises];
      updated[editingIndex] = configuringExercise;
      setExercises(updated);
      setEditingIndex(null);
    } else {
      // Add new
      setExercises([...exercises, configuringExercise]);
    }

    setConfiguringExercise(null);
    setShowAddExercise(false);
    // Reset selection state
    setSelectedMuscle('');
  };

  // Handle editing an existing exercise
  const handleEditExercise = (index) => {
    setEditingIndex(index);
    setConfiguringExercise({ ...exercises[index] });
    setShowAddExercise(true); // Re-use the add panel area for config
  };

  const handleRemoveExercise = (index) => {
    const updated = exercises.filter((_, i) => i !== index);
    // Update order values
    updated.forEach((ex, i) => ex.order = i);
    setExercises(updated);
  };

  const handleMoveExercise = (index, direction) => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === exercises.length - 1)
    ) return;

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    const updated = [...exercises];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    updated.forEach((ex, i) => ex.order = i);
    setExercises(updated);
  };

  const handleSave = () => {
    onSave(selectedDay, exercises);
    onClose();
  };

  const handleClear = () => {
    setExercises([]);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal plan-editor-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px', maxHeight: '90vh', overflow: 'auto' }}>
        <div className="modal-header">
          <h3>📅 Edit Weekly Plan</h3>
          <div className="repeat-badge">↻ Repeats Weekly</div>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {/* Day Selector Tabs */}
          <div className="day-tabs">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((dayShort, idx) => {
              const dayFull = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'][idx];
              const dayExercises = settings?.trainingPlan?.weeklySchedule?.[dayFull];
              const hasPlan = Array.isArray(dayExercises) && dayExercises.length > 0;
              return (
                <button
                  key={dayFull}
                  className={`day-tab ${selectedDay === dayFull ? 'active' : ''} ${hasPlan ? 'has-plan' : ''}`}
                  onClick={() => setSelectedDay(dayFull)}
                >
                  {dayShort}
                  {hasPlan && <span className="exercise-count">{dayExercises.length}</span>}
                </button>
              );
            })}
          </div>

          {/* Current Exercises List */}
          <div className="form-group">
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Exercises for {selectedDay.charAt(0).toUpperCase() + selectedDay.slice(1)}</span>
              <span className="text-secondary" style={{ fontSize: '0.85rem' }}>{exercises.length} exercise{exercises.length !== 1 ? 's' : ''}</span>
            </label>

            {exercises.length === 0 ? (
              <div className="empty-state" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', border: '1px dashed var(--border-color)', borderRadius: '8px' }}>
                <p>No exercises planned for this day</p>
                <p style={{ fontSize: '0.85rem' }}>Click "Add Exercise" to start building your workout</p>
              </div>
            ) : (
              <div className="exercise-list-editor" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {exercises.map((ex, index) => (
                  <div key={ex.id || index} className="exercise-item" style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.75rem',
                    background: 'var(--surface-color)',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                  }}>
                    <div className="exercise-order" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <button
                        className="btn-icon-small"
                        onClick={() => handleMoveExercise(index, 'up')}
                        disabled={index === 0}
                        style={{ opacity: index === 0 ? 0.3 : 1, padding: '2px', fontSize: '0.75rem' }}
                      >▲</button>
                      <button
                        className="btn-icon-small"
                        onClick={() => handleMoveExercise(index, 'down')}
                        disabled={index === exercises.length - 1}
                        style={{ opacity: index === exercises.length - 1 ? 0.3 : 1, padding: '2px', fontSize: '0.75rem' }}
                      >▼</button>
                    </div>
                    <div className="exercise-info" style={{ flex: 1, cursor: 'pointer' }} onClick={() => handleEditExercise(index)}>
                      <div style={{ fontWeight: 500 }}>{ex.name}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {ex.exerciseType === 'cardio'
                          ? `${ex.duration || 30} min${ex.speed ? ` @ ${ex.speed} km/h` : ''}${ex.elevation ? ` • ${ex.elevation}% incline` : ''}`
                          : ex.exerciseType === 'isometric'
                            ? `${ex.sets || 3} × ${ex.holdTime || 60}s hold`
                            : `${ex.sets || 4} × ${ex.targetReps || 10}${ex.weight ? ` @ ${ex.weight}kg` : ''}`
                        }
                      </div>
                    </div>
                    <button
                      className="btn-icon-small"
                      onClick={() => handleEditExercise(index)}
                      style={{ marginRight: '5px', fontSize: '1rem', background: 'none', border: 'none', cursor: 'pointer' }}
                      title="Edit Exercise"
                    >
                      ✏️
                    </button>

                    <span className="exercise-type-badge" style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '0.7rem',
                      textTransform: 'uppercase',
                      background: ex.exerciseType === 'cardio' ? 'var(--warning-color)'
                        : ex.exerciseType === 'isometric' ? 'var(--info-color)'
                          : 'var(--primary-color)',
                      color: 'white',
                    }}>
                      {ex.exerciseType || 'strength'}
                    </span>
                    <button
                      className="btn-icon-small btn-danger"
                      onClick={() => handleRemoveExercise(index)}
                      style={{ color: 'var(--danger-color)', padding: '4px 8px' }}
                    >✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add Exercise Section */}
          {!showAddExercise ? (
            <button
              className="btn btn-primary"
              onClick={() => setShowAddExercise(true)}
              style={{ width: '100%', marginTop: '0.5rem' }}
            >
              + Add Exercise
            </button>
          ) : (
            <div className="add-exercise-panel" style={{
              marginTop: '1rem',
              padding: '1rem',
              background: 'var(--surface-color)',
              borderRadius: '8px',
              border: '1px solid var(--primary-color)',
            }}>
              {configuringExercise ? (
                /* Configuration Form */
                <div className="exercise-config-form">
                  <h4 style={{ margin: '0 0 1rem 0' }}>
                    {editingIndex !== null ? 'Edit' : 'Configure'} {configuringExercise.name}
                  </h4>

                  <div className="config-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                    {/* Dynamic Inputs based on Type */}
                    {(configuringExercise.exerciseType === 'strength' || !configuringExercise.exerciseType) && (
                      <>
                        <div className="form-group">
                          <label>Sets</label>
                          <input
                            type="number"
                            className="form-control"
                            value={configuringExercise.sets}
                            onChange={(e) => setConfiguringExercise({ ...configuringExercise, sets: parseInt(e.target.value) || 0 })}
                          />
                        </div>
                        <div className="form-group">
                          <label>Reps</label>
                          <input
                            type="number"
                            className="form-control"
                            value={configuringExercise.targetReps}
                            onChange={(e) => setConfiguringExercise({ ...configuringExercise, targetReps: parseInt(e.target.value) || 0 })}
                          />
                        </div>
                        <div className="form-group">
                          <label>Weight (kg)</label>
                          <input
                            type="number"
                            className="form-control"
                            value={configuringExercise.weight}
                            placeholder="Optional"
                            onChange={(e) => setConfiguringExercise({ ...configuringExercise, weight: e.target.value })}
                          />
                        </div>
                      </>
                    )}

                    {configuringExercise.exerciseType === 'cardio' && (
                      <>
                        <div className="form-group">
                          <label>Duration (min)</label>
                          <input
                            type="number"
                            className="form-control"
                            value={configuringExercise.duration}
                            onChange={(e) => setConfiguringExercise({ ...configuringExercise, duration: parseInt(e.target.value) || 0 })}
                          />
                        </div>
                        <div className="form-group">
                          <label>Speed (km/h)</label>
                          <input
                            type="number"
                            className="form-control"
                            value={configuringExercise.speed}
                            placeholder="Optional"
                            onChange={(e) => setConfiguringExercise({ ...configuringExercise, speed: e.target.value })}
                          />
                        </div>
                        <div className="form-group">
                          <label>Distance (km)</label>
                          <input
                            type="number"
                            className="form-control"
                            value={configuringExercise.distance}
                            placeholder="Optional"
                            onChange={(e) => setConfiguringExercise({ ...configuringExercise, distance: e.target.value })}
                          />
                        </div>
                      </>
                    )}

                    {configuringExercise.exerciseType === 'isometric' && (
                      <>
                        <div className="form-group">
                          <label>Sets</label>
                          <input
                            type="number"
                            className="form-control"
                            value={configuringExercise.sets}
                            onChange={(e) => setConfiguringExercise({ ...configuringExercise, sets: parseInt(e.target.value) || 0 })}
                          />
                        </div>
                        <div className="form-group">
                          <label>Hold Time (sec)</label>
                          <input
                            type="number"
                            className="form-control"
                            value={configuringExercise.holdTime}
                            onChange={(e) => setConfiguringExercise({ ...configuringExercise, holdTime: parseInt(e.target.value) || 0 })}
                          />
                        </div>
                      </>
                    )}
                  </div>

                  <div className="config-actions" style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        setConfiguringExercise(null);
                        if (editingIndex !== null) {
                          setEditingIndex(null);
                          setShowAddExercise(false);
                        }
                      }}
                    >
                      Back
                    </button>
                    <button className="btn btn-primary" onClick={handleConfirmExercise}>
                      {editingIndex !== null ? 'Update Exercise' : 'Add Exercise'}
                    </button>
                  </div>
                </div>
              ) : (
                /* Selection View */
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h4 style={{ margin: 0 }}>Add Exercise</h4>
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowAddExercise(false)}>Cancel</button>
                  </div>

                  {/* Exercise Type Selection */}
                  <div className="form-group">
                    <label>Exercise Type</label>
                    <div className="type-buttons" style={{ display: 'flex', gap: '0.5rem' }}>
                      {[
                        { id: 'strength', label: '🏋️ Strength', desc: 'Weight/sets/reps' },
                        { id: 'cardio', label: '🏃 Cardio', desc: 'Time/speed/distance' },
                        { id: 'isometric', label: '🧘 Isometric', desc: 'Hold time' },
                      ].map(type => (
                        <button
                          key={type.id}
                          className={`type-btn ${exerciseType === type.id ? 'active' : ''}`}
                          onClick={() => setExerciseType(type.id)}
                          style={{ flex: 1, padding: '0.5rem', textAlign: 'center' }}
                        >
                          <div>{type.label}</div>
                          <div style={{ fontSize: '0.7rem', opacity: 0.7 }}>{type.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Environment Selection */}
                  <div className="form-group">
                    <label>Environment</label>
                    <div className="env-buttons-small" style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        className={`env-btn-small ${selectedEnvironment === 'gym' ? 'active' : ''}`}
                        onClick={() => { setSelectedEnvironment('gym'); setSelectedMuscle(''); }}
                        style={{ flex: 1 }}
                      >🏋️ Gym</button>
                      <button
                        className={`env-btn-small ${selectedEnvironment === 'home' ? 'active' : ''}`}
                        onClick={() => { setSelectedEnvironment('home'); setSelectedMuscle(''); }}
                        style={{ flex: 1 }}
                      >🏠 Home</button>
                    </div>
                  </div>

                  {/* Body Region Tabs */}
                  <div className="form-group">
                    <label>Body Region</label>
                    <div className="region-tabs" style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      {['upper', 'lower', 'core'].map(region => (
                        <button
                          key={region}
                          className={`region-tab ${selectedRegion === region ? 'active' : ''}`}
                          onClick={() => { setSelectedRegion(region); setSelectedMuscle(''); }}
                          style={{ flex: 1, padding: '0.5rem', textTransform: 'capitalize' }}
                        >
                          {region === 'upper' ? '🔼 Upper' : region === 'lower' ? '🔽 Lower' : '🔥 Core'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Muscle Group Selection */}
                  <div className="form-group">
                    <label>Muscle Group</label>
                    <div className="muscle-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                      {allMuscles[selectedRegion]?.map(muscle => (
                        <button
                          key={muscle.id}
                          className={`muscle-btn ${selectedMuscle === muscle.id ? 'active' : ''}`}
                          onClick={() => setSelectedMuscle(muscle.id)}
                        >
                          <span className="muscle-icon">{muscle.icon}</span>
                          <span className="muscle-name">{muscle.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Available Exercises */}
                  {selectedMuscle && availableExercises.length > 0 && (
                    <div className="form-group">
                      <label>Select Exercise</label>
                      <div className="exercise-selection-grid">
                        {availableExercises.map(ex => (
                          <button
                            key={ex.name}
                            className="exercise-select-btn"
                            onClick={() => handleSelectExercise(ex)}
                          >
                            <div className="exercise-name">{ex.name}</div>
                            <div className="exercise-info">
                              {ex.sets}×{ex.targetReps} • {ex.equipment || 'Bodyweight'}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Custom Exercise Input for Cardio */}
                  {exerciseType === 'cardio' && (
                    <div className="form-group">
                      <label>Or add custom cardio</label>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {['Running', 'Cycling', 'Swimming', 'Rowing', 'Jump Rope', 'Elliptical'].map(name => (
                          <button
                            key={name}
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleSelectExercise({ name, exerciseType: 'cardio', duration: 30 })}
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={handleClear}>Clear Day</button>
          <div className="footer-right">
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave}>
              Save ({exercises.length} exercise{exercises.length !== 1 ? 's' : ''})
            </button>
          </div>
        </div>
      </div>
    </div >
  );
}

// Skip Exercise Modal - For skipping individual exercises with a reason
function SkipExerciseModal({ exerciseName, onClose, onSkip }) {
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');

  const EXERCISE_SKIP_REASONS = [
    'Equipment unavailable',
    'Pain or discomfort',
    'Too fatigued',
    'Running out of time',
    'Already trained today',
    'Custom reason',
  ];

  const handleSubmit = (e) => {
    e.preventDefault();
    const finalReason = reason === 'Custom reason' ? customReason : reason;
    if (!finalReason.trim()) return;
    onSkip(finalReason);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Skip Exercise</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p className="text-secondary mb-4">
              Skipping <strong>{exerciseName}</strong>. Please select a reason:
            </p>
            <div className="reason-options">
              {EXERCISE_SKIP_REASONS.map(r => (
                <button
                  key={r}
                  type="button"
                  className={`reason-btn ${reason === r ? 'active' : ''}`}
                  onClick={() => setReason(r)}
                >
                  {r}
                </button>
              ))}
            </div>
            {reason === 'Custom reason' && (
              <input
                type="text"
                className="input mt-4"
                placeholder="Enter your reason..."
                value={customReason}
                onChange={e => setCustomReason(e.target.value)}
              />
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button
              type="submit"
              className="btn btn-warning"
              disabled={!reason || (reason === 'Custom reason' && !customReason.trim())}
            >
              Skip Exercise
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Exercise Editor Modal - Add, edit, delete exercises for a body region
function ExerciseEditorModal({ region, environment, onClose }) {
  const [selectedMuscle, setSelectedMuscle] = useState(null);
  const [editingExercise, setEditingExercise] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newExercise, setNewExercise] = useState({
    name: '',
    sets: 4,
    targetReps: 10,
    weight: null,
    exerciseType: 'strength',
    equipment: '',
    formTip: ''
  });

  const regionNames = { upper: 'Upper Body', lower: 'Lower Body', core: 'Core' };
  const muscleGroups = MUSCLE_GROUPS[region] || [];

  // Get exercises for selected muscle
  const availableExercises = useMemo(() => {
    if (!selectedMuscle) return [];
    return getExercisesForMuscle(selectedRegion, selectedMuscle, selectedEnvironment);
  }, [selectedRegion, selectedMuscle, selectedEnvironment]);

  // Handle selecting an exercise to configure
  const handleSelectExercise = (exercise) => {
    setConfiguringExercise({
      ...exercise,
      exerciseType: exercise.exerciseType || exerciseType,
      // Ensure default values exist
      sets: exercise.sets || 4,
      targetReps: exercise.targetReps || 10,
      weight: exercise.weight || '',
      duration: exercise.duration || 30,
      speed: exercise.speed || '',
      distance: exercise.distance || '',
      incline: exercise.incline || '',
      holdTime: exercise.holdTime || 60,
    });
  };

  // Handle confirming the configured exercise
  const handleConfirmExercise = () => {
    if (!configuringExercise) return;

    if (editingIndex !== null) {
      // Update existing
      const updated = [...exercises];
      updated[editingIndex] = configuringExercise;
      setExercises(updated);
      setEditingIndex(null);
    } else {
      // Add new
      setExercises([...exercises, configuringExercise]);
    }

    setConfiguringExercise(null);
    setShowAddExercise(false);
    // Reset selection state
    setSelectedMuscle('');
  };

  // Handle editing an existing exercise
  const handleEditExercise = (index) => {
    setEditingIndex(index);
    setConfiguringExercise({ ...exercises[index] });
    setShowAddExercise(true); // Re-use the add panel area for config
  };

  const getExercisesForDisplay = () => {
    if (!selectedMuscle) return [];
    return getExercisesForMuscle(environment, selectedMuscle);
  };

  const exercises = getExercisesForDisplay();

  const handleAddExercise = async () => {
    if (!newExercise.name.trim() || !selectedMuscle) return;

    const exercise = createExercise({
      ...newExercise,
      id: `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    });

    await addExercise(environment, selectedMuscle, exercise);
    setNewExercise({ name: '', sets: 4, targetReps: 10, weight: null, exerciseType: 'strength', equipment: '', formTip: '' });
    setShowAddForm(false);
    showToast(`Added ${exercise.name}`, 'success');
  };

  const handleDeleteExercise = async (exerciseName) => {
    if (!window.confirm(`Delete "${exerciseName}"?`)) return;
    await deleteExercise(environment, selectedMuscle, exerciseName);
    showToast(`Deleted ${exerciseName}`, 'success');
  };

  const handleUpdateExercise = async () => {
    if (!editingExercise?.name.trim()) return;
    await updateExercises(environment, selectedMuscle, exercises.map(ex =>
      ex.name === editingExercise.originalName ? { ...ex, ...editingExercise } : ex
    ));
    setEditingExercise(null);
    showToast('Exercise updated', 'success');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal exercise-editor-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h3>✏️ Edit {regionNames[region]} Exercises</h3>
          <span className="badge" style={{ marginLeft: '0.5rem' }}>{environment === 'gym' ? '🏋️ Gym' : '🏠 Home'}</span>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body" style={{ display: 'flex', gap: '1rem', flex: 1, overflow: 'hidden' }}>
          {/* Muscle Group List */}
          <div className="muscle-list" style={{ width: '40%', borderRight: '1px solid var(--border-color)', paddingRight: '1rem', overflowY: 'auto' }}>
            <label className="label mb-2">Select Muscle Group</label>
            {muscleGroups.map(muscle => (
              <button
                key={muscle.id}
                className={`muscle-select-btn ${selectedMuscle === muscle.id ? 'active' : ''}`}
                onClick={() => setSelectedMuscle(muscle.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  width: '100%',
                  padding: '0.75rem',
                  marginBottom: '0.5rem',
                  background: selectedMuscle === muscle.id ? 'var(--primary-color)' : 'var(--surface-color)',
                  color: selectedMuscle === muscle.id ? 'white' : 'inherit',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span>{muscle.icon}</span>
                <span>{muscle.name}</span>
              </button>
            ))}
          </div>

          {/* Exercise List */}
          <div className="exercise-list-panel" style={{ flex: 1, overflowY: 'auto' }}>
            {!selectedMuscle ? (
              <div className="empty-state" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                <p>← Select a muscle group to view exercises</p>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <label className="label">Exercises ({exercises.length})</label>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => setShowAddForm(true)}
                  >
                    + Add Exercise
                  </button>
                </div>

                {/* Add Exercise Form */}
                {showAddForm && (
                  <div className="add-exercise-form" style={{
                    padding: '1rem',
                    background: 'var(--surface-color)',
                    borderRadius: '8px',
                    marginBottom: '1rem',
                    border: '1px solid var(--primary-color)'
                  }}>
                    <h4 style={{ marginBottom: '0.75rem' }}>New Exercise</h4>
                    <input
                      type="text"
                      className="input"
                      placeholder="Exercise name"
                      value={newExercise.name}
                      onChange={e => setNewExercise({ ...newExercise, name: e.target.value })}
                      style={{ marginBottom: '0.5rem' }}
                    />
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <select
                        className="input"
                        value={newExercise.exerciseType}
                        onChange={e => setNewExercise({ ...newExercise, exerciseType: e.target.value })}
                      >
                        <option value="strength">Strength</option>
                        <option value="cardio">Cardio</option>
                        <option value="isometric">Isometric</option>
                        <option value="bodyweight">Bodyweight</option>
                      </select>
                      <input
                        type="number"
                        className="input"
                        placeholder="Sets"
                        value={newExercise.sets}
                        onChange={e => setNewExercise({ ...newExercise, sets: parseInt(e.target.value) || 4 })}
                        style={{ width: '70px' }}
                      />
                      <input
                        type="number"
                        className="input"
                        placeholder="Reps"
                        value={newExercise.targetReps}
                        onChange={e => setNewExercise({ ...newExercise, targetReps: parseInt(e.target.value) || 10 })}
                        style={{ width: '70px' }}
                      />
                    </div>
                    <input
                      type="text"
                      className="input"
                      placeholder="Form tip (optional)"
                      value={newExercise.formTip}
                      onChange={e => setNewExercise({ ...newExercise, formTip: e.target.value })}
                      style={{ marginBottom: '0.75rem' }}
                    />
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn btn-primary btn-sm" onClick={handleAddExercise}>Add</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setShowAddForm(false)}>Cancel</button>
                    </div>
                  </div>
                )}

                {/* Exercise List */}
                <div className="exercise-items" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {exercises.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-secondary)' }}>
                      No exercises yet. Click "Add Exercise" to create one.
                    </div>
                  ) : (
                    exercises.map((ex, idx) => (
                      <div
                        key={ex.name || idx}
                        className="exercise-item"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.75rem',
                          padding: '0.75rem',
                          background: 'var(--surface-color)',
                          borderRadius: '8px',
                          border: '1px solid var(--border-color)',
                        }}
                      >
                        {editingExercise?.originalName === ex.name ? (
                          // Edit mode
                          <div style={{ flex: 1, display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <input
                              type="text"
                              className="input input-sm"
                              value={editingExercise.name}
                              onChange={e => setEditingExercise({ ...editingExercise, name: e.target.value })}
                              style={{ flex: 1, minWidth: '120px' }}
                            />
                            <input
                              type="number"
                              className="input input-sm"
                              value={editingExercise.sets}
                              onChange={e => setEditingExercise({ ...editingExercise, sets: parseInt(e.target.value) || 4 })}
                              style={{ width: '50px' }}
                              placeholder="Sets"
                            />
                            <input
                              type="number"
                              className="input input-sm"
                              value={editingExercise.targetReps}
                              onChange={e => setEditingExercise({ ...editingExercise, targetReps: parseInt(e.target.value) || 10 })}
                              style={{ width: '50px' }}
                              placeholder="Reps"
                            />
                            <button className="btn btn-primary btn-sm" onClick={handleUpdateExercise}>Save</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEditingExercise(null)}>×</button>
                          </div>
                        ) : (
                          // View mode
                          <>
                            <span style={{ flex: 1, fontWeight: 500 }}>{ex.name}</span>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                              {ex.sets || 4}×{ex.targetReps || 10}
                            </span>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => setEditingExercise({ ...ex, originalName: ex.name })}
                              title="Edit"
                            >
                              ✏️
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => handleDeleteExercise(ex.name)}
                              title="Delete"
                              style={{ color: 'var(--danger-color)' }}
                            >
                              🗑️
                            </button>
                          </>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="modal-footer" style={{ borderTop: '1px solid var(--border-color)', padding: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

const trainingStyles = `
  .training-view {
    max-width: 600px;
    margin: 0 auto;
  }

  .view-header {
    margin-bottom: var(--spacing-6);
  }

  .input {
    width: 100%;
    padding: var(--spacing-3);
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text-primary);
    font-size: var(--font-size-base);
    transition: border-color var(--transition-fast);
  }

  .input::placeholder {
    color: var(--color-text-muted);
  }

  .input:focus {
    border-color: var(--color-accent);
    outline: none;
  }

  .view-title {
    font-size: var(--font-size-3xl);
    font-weight: var(--font-weight-bold);
  }

  .view-subtitle {
    margin-top: var(--spacing-1);
  }

  /* Breadcrumb */
  .breadcrumb-container {
    display: flex;
    align-items: center;
    gap: var(--spacing-4);
    margin-bottom: var(--spacing-6);
    padding: var(--spacing-3) var(--spacing-4);
    background: var(--color-bg-card);
    border-radius: var(--radius-lg);
  }

  .btn-back {
    background: none;
    border: none;
    color: var(--color-accent);
    cursor: pointer;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    padding: var(--spacing-1) var(--spacing-2);
    border-radius: var(--radius-md);
    transition: background var(--transition-fast);
  }

  .btn-back:hover {
    background: var(--color-bg-tertiary);
  }

  .breadcrumb-path {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
  }

  /* Selection Section */
  .selection-section {
    animation: fadeIn 0.2s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* ===== HEADER ROW WITH QUICK ACTIONS ===== */
  .header-row {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-4);
  }

  @media (min-width: 600px) {
    .header-row {
      flex-direction: row;
      justify-content: space-between;
      align-items: flex-start;
    }
  }

  .quick-actions-top {
    display: flex;
    gap: var(--spacing-2);
    flex-shrink: 0;
  }

  /* ===== LARGE CENTERED ENVIRONMENT BUTTONS ===== */
  .env-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-4);
    min-height: auto;
    padding: var(--spacing-4) 0;
  }

  .env-buttons-centered {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-4);
    justify-content: center;
    align-items: stretch;
  }

  @media (min-width: 600px) {
    .env-buttons-centered {
      flex-direction: row;
      gap: var(--spacing-6);
    }
  }

  .env-btn-large {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--spacing-6);
    min-width: auto;
    min-height: 150px;
    background: var(--color-bg-card);
    border: 2px solid var(--color-border);
    border-radius: var(--radius-xl);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  @media (min-width: 600px) {
    .env-btn-large {
      min-width: 200px;
      min-height: 200px;
      padding: var(--spacing-6) var(--spacing-8);
    }
  }

  .env-btn-large:hover {
    border-color: var(--color-accent);
    transform: translateY(-4px);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  }

  .env-btn-large.gym:hover {
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(139, 92, 246, 0.15));
    border-color: var(--color-accent);
  }

  .env-btn-large.home:hover {
    background: linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(59, 130, 246, 0.15));
    border-color: var(--color-success);
  }

  /* Gym Closure Banner */
  .gym-closure-banner {
    display: flex;
    align-items: center;
    gap: var(--spacing-3);
    padding: var(--spacing-4);
    background: linear-gradient(135deg, rgba(251, 191, 36, 0.15) 0%, rgba(245, 158, 11, 0.1) 100%);
    border: 1px solid rgba(251, 191, 36, 0.3);
    border-radius: var(--radius-xl);
    margin-bottom: var(--spacing-6);
  }

  .closure-icon {
    font-size: 2rem;
  }

  .closure-content strong {
    display: block;
    color: var(--color-warning);
    margin-bottom: var(--spacing-1);
  }

  .closure-content p {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin: 0;
  }

  /* Disabled Gym Button */
  .env-btn-large.gym.disabled {
    opacity: 0.5;
    cursor: not-allowed;
    border-color: var(--color-border);
  }

  .env-btn-large.gym.disabled:hover {
    transform: none;
    box-shadow: none;
    background: var(--color-bg-card);
    border-color: var(--color-border);
  }

  /* Recommended Home Button */
  .env-btn-large.home.recommended {
    border-color: var(--color-success);
    box-shadow: 0 0 20px rgba(16, 185, 129, 0.2);
    animation: pulse-green 2s infinite;
  }

  .recommended-badge {
    position: absolute;
    top: -8px;
    right: -8px;
    background: var(--color-success);
    color: white;
    padding: var(--spacing-1) var(--spacing-2);
    border-radius: var(--radius-full);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-bold);
  }

  @keyframes pulse-green {
    0%, 100% { box-shadow: 0 0 20px rgba(16, 185, 129, 0.2); }
    50% { box-shadow: 0 0 30px rgba(16, 185, 129, 0.4); }
  }

  .env-icon-large {
    font-size: 4rem;
    margin-bottom: var(--spacing-4);
  }

  .env-label-large {
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-bold);
    color: var(--color-text-primary);
    margin-bottom: var(--spacing-2);
  }

  /* Environment Buttons (legacy) */
  .env-buttons {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--spacing-4);
  }

  .env-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--spacing-6);
    background: var(--color-bg-card);
    border: 2px solid var(--color-border);
    border-radius: var(--radius-xl);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .env-btn:hover {
    border-color: var(--color-accent);
    transform: translateY(-2px);
  }

  .env-btn.gym:hover {
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(139, 92, 246, 0.1));
  }

  .env-btn.home:hover {
    background: linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(59, 130, 246, 0.1));
  }

  .env-icon {
    font-size: 2.5rem;
    margin-bottom: var(--spacing-2);
  }

  .env-label {
    font-weight: var(--font-weight-semibold);
    font-size: var(--font-size-lg);
    color: var(--color-text-primary);
  }

  .env-desc {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin-top: var(--spacing-1);
  }

  /* Quick Actions */
  .quick-actions {
    display: flex;
    justify-content: center;
    gap: var(--spacing-4);
  }

  .training-stats-summary {
    display: flex;
    justify-content: space-around;
    background: var(--color-bg-tertiary);
    padding: var(--spacing-4);
    border-radius: var(--radius-lg);
    margin-bottom: var(--spacing-6);
  }

  .training-stats-summary .stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .training-stats-summary .stat-value {
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-bold);
    color: var(--color-text-primary);
  }

  .training-stats-summary .stat-label {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .btn-compact {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: var(--spacing-2) var(--spacing-4);
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .btn-main {
    font-weight: var(--font-weight-medium);
  }

  .btn-subtext {
    font-size: 10px;
    color: var(--color-text-muted);
    opacity: 0.8;
  }

  .btn-compact:hover {
    border-color: var(--color-accent);
    color: var(--color-text-primary);
  }

  .btn-compact.rest:hover {
    border-color: var(--color-success);
    color: var(--color-success);
  }

  /* Region Buttons */
  .region-buttons {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
  }

  .region-btn {
    display: flex;
    align-items: center;
    gap: var(--spacing-4);
    padding: var(--spacing-4) var(--spacing-5);
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all var(--transition-fast);
    text-align: left;
  }

  .region-btn:hover {
    border-color: var(--color-accent);
    background: var(--color-bg-card-hover);
  }

  .region-icon {
    font-size: 1.5rem;
  }

  .region-label {
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
  }

  .region-desc {
    font-size: var(--font-size-sm);
    color: var(--color-text-muted);
    margin-left: auto;
  }

  .region-btn-container {
    position: relative;
    display: flex;
    gap: 0.5rem;
    align-items: stretch;
  }

  .region-btn-container .region-btn {
    flex: 1;
  }

  .btn-edit-exercises {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    cursor: pointer;
    font-size: 1.1rem;
    transition: all var(--transition-fast);
  }

  .btn-edit-exercises:hover {
    background: var(--color-accent);
    border-color: var(--color-accent);
  }

  /* Muscle Grid */
  .muscle-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--spacing-3);
  }

  .muscle-btn-wrapper {
    position: relative;
    width: 100%;
  }

  .muscle-btn-wrapper .muscle-btn {
    width: 100%;
  }

  .muscle-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: var(--spacing-4);
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .muscle-btn:hover {
    border-color: var(--color-accent);
    transform: translateY(-2px);
  }

  .muscle-icon {
    font-size: 1.8rem;
    margin-bottom: var(--spacing-2);
  }

  .muscle-label {
    font-weight: var(--font-weight-medium);
    color: var(--color-text-primary);
  }

  .muscle-desc {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
    margin-top: var(--spacing-1);
  }

  /* Section Label */
  .section-label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: var(--spacing-3);
  }

  /* Exercise List */
  .exercise-list {
    padding: var(--spacing-4);
  }

  .exercise-preview-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-3);
    padding: var(--spacing-3) 0;
    border-bottom: 1px solid var(--color-border);
  }

  .exercise-preview-item:last-child {
    border-bottom: none;
  }

  .exercise-number {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-full);
    font-size: var(--font-size-sm);
    color: var(--color-text-muted);
    flex-shrink: 0;
  }

  .exercise-info {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .exercise-name {
    font-weight: var(--font-weight-medium);
  }

  .exercise-equipment {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
  }

  .exercise-sets {
    font-size: var(--font-size-sm);
    flex-shrink: 0;
  }

  /* Status Cards */
  .status-card {
    text-align: center;
    padding: var(--spacing-12);
  }

  .status-card .status-icon {
    font-size: 4rem;
    margin-bottom: var(--spacing-4);
  }

  .status-card h2 {
    font-size: var(--font-size-2xl);
    margin-bottom: var(--spacing-2);
  }

  /* Summary Stats */
  .summary-stats {
    display: flex;
    justify-content: space-around;
    margin-top: var(--spacing-4);
  }

  .summary-stat {
    text-align: center;
  }

  .summary-stat .stat-value {
    font-size: var(--font-size-2xl);
    font-weight: var(--font-weight-bold);
  }

  .summary-stat .stat-label {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  /* Active Workout Styles */
  .workout-progress-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-4);
  }

  .exercise-progress {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
  }

  .exercise-card {
    padding: var(--spacing-8);
    text-align: center;
  }

  .exercise-card .exercise-name {
    font-size: var(--font-size-2xl);
    font-weight: var(--font-weight-bold);
    margin-bottom: var(--spacing-2);
  }

  .last-week {
    margin-bottom: var(--spacing-6);
  }

  .set-indicators {
    display: flex;
    justify-content: center;
    gap: var(--spacing-2);
    margin-bottom: var(--spacing-6);
  }

  .set-indicator {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid var(--color-border);
    border-radius: var(--radius-full);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-muted);
  }

  .set-indicator.completed {
    background: var(--color-success);
    border-color: var(--color-success);
    color: white;
  }

  .set-indicator.current {
    border-color: var(--color-accent);
    color: var(--color-accent);
  }

  .rest-timer {
    background: var(--color-bg-tertiary);
    padding: var(--spacing-6);
    border-radius: var(--radius-lg);
    margin: var(--spacing-6) 0;
  }

  .rest-timer-label {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin-bottom: var(--spacing-2);
  }

  .rest-timer-value {
    font-size: var(--font-size-4xl);
    font-weight: var(--font-weight-bold);
    color: var(--color-accent);
    margin-bottom: var(--spacing-4);
  }

  .set-input {
    text-align: left;
  }

  .set-number {
    text-align: center;
    color: var(--color-accent);
    margin-bottom: var(--spacing-4);
  }

  .input-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--spacing-4);
  }

  .input-row-3 {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: var(--spacing-2);
  }

  .completed-sets .sets-list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-2);
    justify-content: center;
  }

  .set-badge {
    padding: var(--spacing-1) var(--spacing-3);
    background: var(--color-success-light);
    color: var(--color-success);
    border-radius: var(--radius-full);
    font-size: var(--font-size-sm);
  }

  .form-tip {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
    padding: var(--spacing-3);
    background: var(--color-info-light);
    border-radius: var(--radius-md);
    margin-top: var(--spacing-6);
    font-size: var(--font-size-sm);
    color: var(--color-info);
  }

  /* Modal Styles */
  .reason-options {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-2);
  }

  .reason-btn {
    padding: var(--spacing-2) var(--spacing-4);
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .reason-btn:hover {
    border-color: var(--color-accent);
    color: var(--color-text-primary);
  }

  .reason-btn.active {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: white;
  }

  /* ===== DETAILED MUSCLE VIEW STYLES ===== */
  
  .detail-view {
    max-height: calc(100vh - 200px);
    overflow-y: auto;
    padding-right: var(--spacing-2);
  }

  .muscle-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-4);
    margin-bottom: var(--spacing-6);
  }

  .muscle-header-icon {
    font-size: 3rem;
  }

  .muscle-header-name {
    font-size: var(--font-size-2xl);
    font-weight: var(--font-weight-bold);
  }

  .muscle-info-card {
    padding: var(--spacing-5);
    margin-bottom: var(--spacing-4);
  }

  .info-section {
    margin-bottom: var(--spacing-4);
  }

  .info-section:last-child {
    margin-bottom: 0;
  }

  .info-title {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
    margin-bottom: var(--spacing-2);
  }

  .info-text {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    line-height: 1.5;
  }

  .tags-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-2);
  }

  .tag {
    padding: var(--spacing-1) var(--spacing-3);
    background: var(--color-accent-light);
    color: var(--color-accent);
    border-radius: var(--radius-full);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
  }

  .prescription-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--spacing-3);
  }

  .prescription-item {
    display: flex;
    flex-direction: column;
    padding: var(--spacing-3);
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-md);
  }

  .prescription-label {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
    margin-bottom: var(--spacing-1);
  }

  .prescription-value {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-primary);
  }

  .exercises-section {
    margin-top: var(--spacing-6);
    margin-bottom: var(--spacing-4);
  }

  .exercise-tip {
    font-size: var(--font-size-xs);
    color: var(--color-info);
    margin-top: var(--spacing-1);
  }

  .info-card {
    padding: var(--spacing-4);
    margin-bottom: var(--spacing-4);
  }

  .info-card .info-title {
    margin-bottom: var(--spacing-3);
  }

  .info-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .info-list li {
    position: relative;
    padding-left: var(--spacing-5);
    margin-bottom: var(--spacing-2);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    line-height: 1.5;
  }

  .info-list li::before {
    content: '•';
    position: absolute;
    left: var(--spacing-2);
    color: var(--color-accent);
  }

  .info-card.warning {
    border-left: 3px solid var(--color-warning);
  }

  .info-card.warning .info-list li::before {
    color: var(--color-warning);
  }

  .info-card.recovery {
    border-left: 3px solid var(--color-success);
  }

  .recovery-content {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
  }

  .recovery-section {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-2);
    font-size: var(--font-size-sm);
  }

  .recovery-label {
    font-weight: var(--font-weight-medium);
    color: var(--color-text-primary);
    min-width: 80px;
  }

  .recovery-value {
    color: var(--color-text-secondary);
    flex: 1;
  }

  /* ===== WIDER LAYOUT ===== */
  .training-view {
    max-width: 1000px;
    margin: 0 auto;
  }

  .detail-view {
    max-width: 100%;
  }

  /* ===== EDIT MODE STYLES ===== */
  .edit-mode-toggle {
    display: flex;
    justify-content: flex-end;
    margin-bottom: var(--spacing-4);
  }

  .btn-edit-mode {
    padding: var(--spacing-2) var(--spacing-4);
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    color: var(--color-text-secondary);
    cursor: pointer;
    font-size: var(--font-size-sm);
    transition: all var(--transition-fast);
  }

  .btn-edit-mode:hover {
    background: var(--color-bg-card);
    color: var(--color-text-primary);
  }

  .btn-edit-mode.active {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: white;
  }

  /* Inline Input */
  .inline-input {
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-accent);
    border-radius: var(--radius-sm);
    color: var(--color-text-primary);
    font-size: inherit;
    padding: var(--spacing-1) var(--spacing-2);
    outline: none;
    min-width: 60px;
  }

  .inline-input.full {
    width: 100%;
  }

  /* Editable Text */
  .editable-text {
    cursor: pointer;
    padding: var(--spacing-1) var(--spacing-2);
    border-radius: var(--radius-sm);
    transition: background var(--transition-fast);
  }

  .editable-text:hover {
    background: rgba(59, 130, 246, 0.1);
  }

  /* Tags with Edit */
  .tag.editable {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-1);
    padding-right: var(--spacing-1);
  }

  .btn-delete-tag {
    background: none;
    border: none;
    color: var(--color-error);
    cursor: pointer;
    font-size: var(--font-size-sm);
    padding: 0 var(--spacing-1);
    opacity: 0.7;
  }

  .btn-delete-tag:hover {
    opacity: 1;
  }

  /* Add Buttons */
  .btn-add-sm {
    background: var(--color-accent);
    border: none;
    border-radius: var(--radius-full);
    color: white;
    cursor: pointer;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-left: var(--spacing-2);
    transition: transform var(--transition-fast);
  }

  .btn-add-sm:hover {
    transform: scale(1.1);
  }

  .btn-add {
    background: var(--color-accent);
    border: none;
    border-radius: var(--radius-md);
    color: white;
    cursor: pointer;
    font-size: var(--font-size-sm);
    padding: var(--spacing-1) var(--spacing-3);
    margin-left: var(--spacing-3);
  }

  /* Editable List Items */
  .editable-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
  }

  .editable-item span {
    flex: 1;
    cursor: pointer;
    padding: var(--spacing-1);
    border-radius: var(--radius-sm);
    transition: background var(--transition-fast);
  }

  .editable-item span:hover {
    background: rgba(59, 130, 246, 0.1);
  }

  .btn-delete-inline {
    background: none;
    border: none;
    color: var(--color-error);
    cursor: pointer;
    font-size: var(--font-size-lg);
    padding: 0;
    opacity: 0.6;
  }

  .btn-delete-inline:hover {
    opacity: 1;
  }

  /* Delete Exercise Button */
  .btn-delete-item {
    background: none;
    border: none;
    cursor: pointer;
    font-size: var(--font-size-lg);
    opacity: 0.6;
    transition: opacity var(--transition-fast);
  }

  .btn-delete-item:hover {
    opacity: 1;
  }

  .exercise-preview-item {
    position: relative;
  }

  /* Add Exercise Form */
  .add-exercise-form {
    margin-top: var(--spacing-4);
    padding: var(--spacing-4);
  }

  .add-exercise-form h4 {
    margin-bottom: var(--spacing-3);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
  }

  .form-grid {
    display: grid;
    grid-template-columns: 1fr 80px 80px 1fr;
    gap: var(--spacing-3);
    margin-bottom: var(--spacing-4);
  }

  .form-grid .input {
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text-primary);
    padding: var(--spacing-2) var(--spacing-3);
    font-size: var(--font-size-sm);
  }

  .form-grid .input:focus {
    border-color: var(--color-accent);
    outline: none;
  }

  .form-grid .input.full-width {
    grid-column: 1 / -1;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--spacing-3);
  }

  /* Info Title with Add Button */
  .info-title {
    display: flex;
    align-items: center;
  }

  .section-label {
    display: flex;
    align-items: center;
  }

  /* ===== MUSCLE HEADER ROW WITH START BUTTON ===== */
  .muscle-header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-6);
    gap: var(--spacing-4);
  }

  .btn-start-top {
    padding: var(--spacing-3) var(--spacing-6);
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-bold);
    white-space: nowrap;
    background: linear-gradient(135deg, var(--color-success), #059669);
    border: none;
    border-radius: var(--radius-lg);
    color: white;
    cursor: pointer;
    transition: transform var(--transition-fast), box-shadow var(--transition-fast);
  }

  .btn-start-top:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 20px rgba(16, 185, 129, 0.4);
  }

  /* ===== EDITABLE MUSCLE GROUP STYLES ===== */
  .muscle-btn-wrapper.editing .muscle-btn {
    cursor: default;
  }

  .btn-delete-muscle {
    position: absolute;
    top: -8px;
    right: -8px;
    width: 24px;
    height: 24px;
    border-radius: var(--radius-full);
    background: var(--color-error);
    border: 2px solid var(--color-bg);
    color: white;
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-bold);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
    transition: transform var(--transition-fast);
  }

  .btn-delete-muscle:hover {
    transform: scale(1.1);
  }

  .editable-icon {
    cursor: pointer;
    padding: var(--spacing-1);
    border-radius: var(--radius-md);
    transition: background var(--transition-fast);
  }

  .editable-icon:hover {
    background: rgba(59, 130, 246, 0.2);
  }

  .icon-input {
    width: 60px;
    text-align: center;
    font-size: 2rem;
  }

  .add-muscle-btn {
    border: 2px dashed var(--color-accent) !important;
    background: rgba(59, 130, 246, 0.05) !important;
  }

  .add-muscle-btn:hover {
    background: rgba(59, 130, 246, 0.1) !important;
    border-color: var(--color-accent) !important;
  }

  .add-muscle-btn .muscle-icon {
    opacity: 0.8;
  }

  /* New styles for Specific Exercise Selection & Badges */
  .plan-editor-modal .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .plan-editor-modal .btn-close {
    background: transparent;
    border: none;
    color: var(--color-text-muted);
    font-size: 1.5rem;
    cursor: pointer;
    line-height: 1;
    border-radius: var(--radius-sm);
    transition: all var(--transition-fast);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
  }

  .plan-editor-modal .btn-close:hover {
    background: var(--color-error-light);
    color: var(--color-error);
  }

  .repeat-badge {
    background: var(--color-bg-tertiary);
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 0.75rem;
    color: var(--color-text-secondary);
    border: 1px solid var(--color-border);
    margin-right: auto;
    margin-left: 12px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .exercise-selection-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 200px;
    overflow-y: auto;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: 12px;
  }

  .exercise-select-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 0.2s;
    background: var(--color-bg-tertiary);
    border: 1px solid transparent;
  }

  .exercise-select-item:hover {
    background-color: var(--color-bg-hover);
    border-color: var(--color-border);
  }

  .exercise-select-item.selected {
    background-color: rgba(99, 102, 241, 0.1);
    border-color: var(--color-accent);
  }

  .select-checkbox {
    width: 20px;
    height: 20px;
    border: 2px solid var(--color-text-secondary);
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    color: white;
    transition: all 0.2s;
  }

  .exercise-select-item.selected .select-checkbox {
    border-color: var(--color-accent);
    background-color: var(--color-accent);
  }

  .select-name {
    font-size: 0.95rem;
    color: var(--color-text-primary);
  }

  /* ===== MOBILE RESPONSIVE STYLES ===== */
  @media (max-width: 768px) {
    .env-section {
      min-height: auto;
      padding: var(--spacing-4);
    }

    .env-buttons-centered {
      flex-direction: column;
      gap: var(--spacing-4);
    }

    .env-btn-large {
      min-width: auto;
      width: 100%;
      min-height: 200px;
      padding: var(--spacing-4);
    }

    .env-icon-large {
      font-size: 2.5rem;
    }

    .env-label-large {
      font-size: var(--font-size-lg);
    }

    .region-buttons {
      gap: var(--spacing-2);
    }

    .region-btn {
      padding: var(--spacing-3);
    }

    .muscle-grid {
      grid-template-columns: repeat(2, 1fr);
      gap: var(--spacing-2);
    }

    .workout-header {
      flex-direction: column;
      gap: var(--spacing-3);
    }

    .workout-actions {
      width: 100%;
      justify-content: space-between;
    }

    .exercise-card .log-form {
      flex-direction: column;
    }
  }

  @media (max-width: 480px) {
    .muscle-grid {
      grid-template-columns: 1fr;
    }

    .env-btn-large {
      min-height: 150px;
    }
  }

  /* ===== Weekly Plan Styles ===== */
  .planned-workout-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-4);
    padding: var(--spacing-4);
    background: linear-gradient(135deg, var(--color-accent-dark) 0%, var(--color-accent) 100%);
    border-radius: var(--radius-lg);
    margin-bottom: var(--spacing-4);
  }

  .planned-workout-card.rest {
    background: var(--color-bg-card);
    border: 1px dashed var(--color-border);
    justify-content: center;
    gap: var(--spacing-2);
  }

  .planned-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-3);
  }

  .planned-icon {
    font-size: 2rem;
  }

  .planned-info {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1);
  }

  .planned-info strong {
    font-size: var(--font-size-lg);
    color: white;
  }

  .planned-meta {
    font-size: var(--font-size-sm);
    color: rgba(255, 255, 255, 0.8);
  }

  .planned-label {
    color: var(--color-text-secondary);
  }

  .weekly-plan-section {
    margin-bottom: var(--spacing-6);
  }

  .weekly-plan-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-3);
  }

  .section-title {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .weekly-plan-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: var(--spacing-2);
  }

  .plan-day {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-1);
    padding: var(--spacing-3) var(--spacing-2);
    background: var(--color-bg-card);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all var(--transition-fast);
    border: 2px solid transparent;
  }

  .plan-day:hover {
    background: var(--color-bg-tertiary);
    transform: translateY(-2px);
  }

  .plan-day.today {
    border-color: var(--color-accent);
    background: var(--color-accent-bg);
  }

  .plan-day.rest {
    opacity: 0.7;
  }

  .day-label {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-secondary);
    text-transform: uppercase;
  }

  .day-icon {
    font-size: 1.25rem;
  }

  .day-focus {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    text-align: center;
    line-height: 1.2;
    min-height: 1.4em;
  }

  /* Plan Editor Modal */
  .plan-editor-modal {
    max-width: 500px;
    width: 90vw;
  }

  .day-tabs {
    display: flex;
    gap: var(--spacing-1);
    margin-bottom: var(--spacing-4);
    overflow-x: auto;
    padding-bottom: var(--spacing-2);
  }

  .day-tab {
    flex: 1;
    min-width: 40px;
    padding: var(--spacing-2) var(--spacing-1);
    background: var(--color-bg-tertiary);
    border: none;
    border-radius: var(--radius-md);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: all var(--transition-fast);
    position: relative;
  }

  .day-tab:hover {
    background: var(--color-bg-card);
  }

  .day-tab.active {
    background: var(--color-accent);
    color: white;
  }

  .day-tab.has-plan::after {
    content: '';
    position: absolute;
    bottom: 4px;
    left: 50%;
    transform: translateX(-50%);
    width: 4px;
    height: 4px;
    background: var(--color-success);
    border-radius: 50%;
  }

  .day-tab.active.has-plan::after {
    background: white;
  }

  .region-tab {
    flex: 1;
    padding: 0.5rem;
    background: rgba(30, 41, 59, 0.8);
    border: 2px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--radius-md);
    color: rgba(255, 255, 255, 0.85);
    cursor: pointer;
    transition: all 0.2s ease;
    text-transform: capitalize;
  }

  .region-tab:hover {
    background: rgba(52, 211, 153, 0.15);
    border-color: rgba(52, 211, 153, 0.5);
    color: #34d399;
    transform: translateY(-1px);
  }

  .region-tab.active {
    border-color: #34d399;
    background: rgba(52, 211, 153, 0.2);
    color: #34d399;
  }

  .type-buttons {
    display: flex;
    gap: var(--spacing-2);
  }

  .type-btn {
    flex: 1;
    padding: var(--spacing-3);
    background: rgba(30, 41, 59, 0.8);
    border: 2px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--radius-md);
    font-size: var(--font-size-base);
    color: rgba(255, 255, 255, 0.85);
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: center;
  }

  .type-btn:hover {
    background: rgba(52, 211, 153, 0.15);
    border-color: rgba(52, 211, 153, 0.5);
    color: #34d399;
    transform: translateY(-2px);
  }

  .type-btn.active {
    border-color: #34d399;
    background: rgba(52, 211, 153, 0.2);
    color: #34d399;
  }

  .env-buttons-small {
    display: flex;
    gap: var(--spacing-2);
  }

  .env-btn-small {
    flex: 1;
    padding: var(--spacing-2) var(--spacing-3);
    background: rgba(30, 41, 59, 0.8);
    border: 2px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
    color: rgba(255, 255, 255, 0.85);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .env-btn-small:hover {
    background: rgba(52, 211, 153, 0.15);
    border-color: rgba(52, 211, 153, 0.5);
    color: #34d399;
    transform: translateY(-1px);
  }

  .env-btn-small.active {
    border-color: #34d399;
    background: rgba(52, 211, 153, 0.2);
    color: #34d399;
  }

  .plan-editor-modal .muscle-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--spacing-2);
  }

  .muscle-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-1);
    padding: var(--spacing-3) var(--spacing-2);
    background: rgba(30, 41, 59, 0.8);
    border: 2px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .muscle-btn:hover {
    background: rgba(52, 211, 153, 0.15);
    border-color: rgba(52, 211, 153, 0.5);
    transform: translateY(-2px);
  }

  .muscle-btn:hover .muscle-name {
    color: #34d399;
  }

  .muscle-btn.active {
    border-color: #34d399;
    background: rgba(52, 211, 153, 0.2);
  }

  .muscle-btn.active .muscle-name {
    color: #34d399;
  }

  .muscle-icon {
    font-size: 1.5rem;
  }

  .muscle-name {
    font-size: var(--font-size-xs);
    color: rgba(255, 255, 255, 0.75);
    transition: color 0.2s ease;
  }

  .exercise-selection-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
    max-height: 200px;
    overflow-y: auto;
  }

  .exercise-select-btn {
    padding: 0.75rem;
    text-align: left;
    background: rgba(30, 41, 59, 0.8);
    border: 2px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .exercise-select-btn:hover {
    background: rgba(52, 211, 153, 0.15);
    border-color: rgba(52, 211, 153, 0.5);
    transform: translateY(-1px);
  }

  .exercise-select-btn .exercise-name {
    font-weight: 500;
    color: rgba(255, 255, 255, 0.95);
    margin-bottom: 2px;
  }

  .exercise-select-btn:hover .exercise-name {
    color: #34d399;
  }

  .exercise-config-form {
    background: var(--surface-color);
  }

  .config-grid .form-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-size: 0.9rem;
    color: var(--text-secondary);
  }

  .config-grid .form-control {
    width: 100%;
    padding: 0.75rem;
    background: rgba(30, 41, 59, 1);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    color: white;
    font-size: 1rem;
  }

  .config-grid .form-control:focus {
    border-color: var(--primary-color);
    outline: none;
  }

  .modal-footer .footer-right {
    display: flex;
    gap: var(--spacing-2);
  }

  .modal-footer {
    display: flex;
    justify-content: space-between;
  }

  @media (max-width: 480px) {
    .weekly-plan-grid {
      grid-template-columns: repeat(7, 1fr);
      gap: var(--spacing-1);
    }

    .plan-day {
      padding: var(--spacing-2) var(--spacing-1);
    }

    .day-icon {
      font-size: 1rem;
    }

    .day-focus {
      display: none;
    }

    .plan-editor-modal .muscle-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
`;

// Helper Component: Real-time Workout Timer
function WorkoutTimer({ startTime }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startTime) return;
    const start = new Date(startTime).getTime();
    // Initial set
    setElapsed(Math.floor((Date.now() - start) / 1000));

    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  const formatTime = (seconds) => {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <span className="workout-timer badge badge-ghost text-mono font-bold text-lg">
      ⏱️ {formatTime(elapsed)}
    </span>
  );
}
